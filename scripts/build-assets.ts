import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import {
  BBOX_BNG,
  BBOX_WGS84,
  BOX_SIZE_M,
  CENTRE_BNG,
  CENTRE_WGS84,
  HALF_BOX_M,
  POSTCODE,
  wgs84ToLocal,
} from './config.ts';
import type {
  BuildingFeature,
  LanduseFeature,
  LinearBarrierFeature,
  PlaceLabel,
  RoadFeature,
  TerrainData,
  TreePoint,
  ViewpointPreset,
  WaterFeature,
  WorldFeaturesData,
} from '../src/types.ts';

const CACHE_DIR = path.resolve(process.cwd(), 'scripts/cache');
const PUBLIC_DATA_DIR = path.resolve(process.cwd(), 'public/data');

// Deterministic pseudo-random generator for reproducible tree/hedge placement
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pointInPolygon(x: number, z: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0],
      zi = poly[i][1];
    const xj = poly[j][0],
      zj = poly[j][1];
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegmentSq(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number
): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return (px - x1) ** 2 + (pz - z1) ** 2;
  let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projZ = z1 + t * dz;
  return (px - projX) ** 2 + (pz - projZ) ** 2;
}

function minDistToPolyline(px: number, pz: number, pts: [number, number][]): number {
  let minSq = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const dSq = distToSegmentSq(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (dSq < minSq) minSq = dSq;
  }
  return Math.sqrt(minSq);
}

function makeRectFootprint(
  cx: number,
  cz: number,
  width: number,
  depth: number,
  angleDeg: number
): [number, number][] {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = width / 2;
  const hd = depth / 2;
  const corners: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  return corners.map(([lx, lz]) => [
    Number((cx + lx * cos - lz * sin).toFixed(2)),
    Number((cz + lx * sin + lz * cos).toFixed(2)),
  ]);
}

function sampleTerrainHeight(terrain: TerrainData, x: number, z: number): number {
  const u = Math.max(0, Math.min(1, (x + HALF_BOX_M) / BOX_SIZE_M));
  const v = Math.max(0, Math.min(1, (z + HALF_BOX_M) / BOX_SIZE_M));
  const col = Math.min(terrain.gridCols - 1, Math.max(0, Math.floor(u * (terrain.gridCols - 1))));
  const row = Math.min(terrain.gridRows - 1, Math.max(0, Math.floor(v * (terrain.gridRows - 1))));
  return terrain.heights[row * terrain.gridCols + col];
}

async function main() {
  fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });

  const terrainRawPath = path.join(CACHE_DIR, 'terrain-raw.json');
  const osmRawPath = path.join(CACHE_DIR, 'osm-raw.json');

  if (!fs.existsSync(terrainRawPath) || !fs.existsSync(osmRawPath)) {
    throw new Error('Missing terrain-raw.json or osm-raw.json in scripts/cache. Run fetch scripts first.');
  }

  const terrain: TerrainData = JSON.parse(fs.readFileSync(terrainRawPath, 'utf8'));
  const osmRaw = JSON.parse(fs.readFileSync(osmRawPath, 'utf8'));

  const nodes = new Map<number, { id: number; lat: number; lon: number; x: number; z: number; tags?: Record<string, string> }>();
  for (const el of osmRaw.elements) {
    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      const [x, z] = wgs84ToLocal(el.lat, el.lon);
      nodes.set(el.id, { id: el.id, lat: el.lat, lon: el.lon, x, z, tags: el.tags });
    }
  }

  const roads: RoadFeature[] = [];
  const water: WaterFeature[] = [];
  const landuse: LanduseFeature[] = [];
  const barriers: LinearBarrierFeature[] = [];
  const buildings: BuildingFeature[] = [];
  const labels: PlaceLabel[] = [];

  for (const el of osmRaw.elements) {
    if (el.type !== 'way' || !Array.isArray(el.nodes) || !el.tags) continue;
    const pts: [number, number][] = el.nodes
      .map((id: number) => nodes.get(id))
      .filter(Boolean)
      .map((n: any) => [n.x, n.z] as [number, number]);

    if (pts.length < 2) continue;
    const tags: Record<string, string> = el.tags;

    // 1. Highways (Roads, Lanes, Bridges, Tracks, Footpaths)
    if (tags.highway) {
      let category: RoadFeature['category'] = 'country_lane';
      let width = 4.2;
      if (tags.highway === 'footway' || tags.highway === 'path') {
        category = 'footpath';
        width = 1.4;
      } else if (tags.highway === 'bridleway') {
        category = 'bridleway';
        width = 2.0;
      } else if (tags.highway === 'track') {
        category = 'track';
        width = 2.8;
      } else if (tags.highway === 'service') {
        category = 'driveway';
        width = 3.0;
      } else if (tags.name === 'Lower Wych Road' || tags.name === 'The Wychough') {
        category = 'primary_lane';
        width = 4.6;
      } else {
        category = 'country_lane';
        width = 3.8;
      }

      roads.push({
        id: `way-${el.id}`,
        name: tags['bridge:name'] || tags.name,
        ref: tags.ref || tags.highway_authority_ref,
        highway: tags.highway,
        category,
        surface: tags.surface || (category === 'footpath' ? 'grass_earth' : category === 'track' ? 'gravel' : 'asphalt'),
        width,
        bridge: tags.bridge === 'yes',
        points: pts,
      });

      // Add stone bridge parapet walls if bridge=yes
      if (tags.bridge === 'yes' && pts.length >= 2) {
        const p0 = pts[0];
        const p1 = pts[pts.length - 1];
        const dx = p1[0] - p0[0];
        const dz = p1[1] - p0[1];
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;
        const offset = width * 0.55;
        barriers.push({
          id: `bridge-parapet-L-${el.id}`,
          type: 'wall',
          height: 1.05,
          width: 0.45,
          points: pts.map(([x, z]) => [Number((x + nx * offset).toFixed(2)), Number((z + nz * offset).toFixed(2))]),
        });
        barriers.push({
          id: `bridge-parapet-R-${el.id}`,
          type: 'wall',
          height: 1.05,
          width: 0.45,
          points: pts.map(([x, z]) => [Number((x - nx * offset).toFixed(2)), Number((z - nz * offset).toFixed(2))]),
        });
      }
    }

    // 2. Waterways (Wych Brook, Shothill Brook, Tributaries)
    if (tags.waterway) {
      const isMainBrook = tags.name === 'Wych Brook';
      water.push({
        id: `water-${el.id}`,
        name: tags.name || 'Stream',
        type: 'stream',
        isPolygon: false,
        width: isMainBrook ? 4.8 : 2.4,
        points: pts,
      });
    }

    // 3. Landuse & Woodland
    if (tags.landuse === 'forest' || tags.natural === 'wood') {
      landuse.push({
        id: `landuse-${el.id}`,
        type: 'woodland',
        name: tags.name || 'Valley Woodland',
        polygon: pts,
      });
    }

    // 4. Explicit OSM buildings if any
    if (tags.building) {
      const cx = pts.reduce((acc, p) => acc + p[0], 0) / pts.length;
      const cz = pts.reduce((acc, p) => acc + p[1], 0) / pts.length;
      const levels = Number(tags['building:levels']) || 2;
      const eaves = Number(tags.height) || levels * 3.0;
      buildings.push({
        id: `osm-bldg-${el.id}`,
        name: tags.name,
        type: tags.building,
        footprint: pts,
        center: [Number(cx.toFixed(2)), Number(cz.toFixed(2))],
        eavesHeight: eaves,
        ridgeHeight: eaves + 2.6,
        levels,
        wallMaterial: 'brick',
        roofMaterial: 'slate',
        roofShape: 'gabled',
        tags,
      });
    }
  }

  // Carve subtle stream channel into terrain along Wych Brook & Shothill Brook so water sits naturally in the brook bed
  for (let r = 0; r < terrain.gridRows; r++) {
    const z = -HALF_BOX_M + (r / (terrain.gridRows - 1)) * BOX_SIZE_M;
    for (let c = 0; c < terrain.gridCols; c++) {
      const x = -HALF_BOX_M + (c / (terrain.gridCols - 1)) * BOX_SIZE_M;
      let minStreamDist = Infinity;
      for (const w of water) {
        const d = minDistToPolyline(x, z, w.points);
        if (d < minStreamDist) minStreamDist = d;
      }
      if (minStreamDist < 10) {
        const factor = Math.cos((minStreamDist / 10) * (Math.PI / 2));
        const carve = 1.15 * factor * factor;
        const idx = r * terrain.gridCols + c;
        terrain.heights[idx] = Number((terrain.heights[idx] - carve).toFixed(2));
      }
    }
  }

  // Add the field pond documented in Geograph ("Pond by the Bishop Bennet Way - geograph.org.uk - 4421277")
  // Exact position verified from 1m EA LIDAR & aerial imagery north of Hill Farm at (-2, -232)
  const pondCenter: [number, number] = [-2, -232];
  const pondPts: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const rx = 12 + Math.sin(ang * 3) * 1.8;
    const rz = 8.5 + Math.cos(ang * 2) * 1.4;
    pondPts.push([
      Number((pondCenter[0] + Math.cos(ang) * rx).toFixed(2)),
      Number((pondCenter[1] + Math.sin(ang) * rz).toFixed(2)),
    ]);
  }
  water.push({
    id: 'water-bishop-bennet-pond',
    name: 'Field Pond (Bishop Bennet Way)',
    type: 'pond',
    isPolygon: true,
    width: 20,
    points: pondPts,
  });

  // Ground-truth buildings of Lower Wych extracted from Environment Agency 1m Composite LIDAR
  // First/Last Return DSM (ea-lidar-dsm.tif & ea-lidar-fzdsm.tif) and verified against:
  // - Ordnance Survey 1:2,500 / 1:10,000 maps & NLS OS 25-inch historic maps
  // - Royal Mail PAF / EPC register addresses for SY14 7JX, SY14 7JZ, SY14 7JU, SY14 7JY
  // - 11 Geograph Britain & Ireland / Wikimedia Commons geotagged ground photographs
  const hamletBuildings: Array<{
    id: string;
    name?: string;
    type: string;
    cx: number;
    cz: number;
    w: number;
    d: number;
    angle: number;
    eaves: number;
    ridge: number;
    levels: number;
    wall: BuildingFeature['wallMaterial'];
    roof: BuildingFeature['roofMaterial'];
    shape: BuildingFeature['roofShape'];
    color?: string;
  }> = [
    // =========================================================================
    // CLUSTER 1: SY14 7JX Postcode Centre & Wigland Hall Lane Bend
    // Verified against Geograph #4421157 (commons-128747183.jpg), OS 25-inch map, and 1m LIDAR DSM #11-#26
    // =========================================================================
    {
      id: 'bldg-valley-chapel',
      name: 'Valley Chapel (SY14 7JX)',
      type: 'chapel',
      cx: -1.6,
      cz: -0.7,
      w: 13.8,
      d: 8.6,
      angle: -74,
      eaves: 4.6,
      ridge: 7.4,
      levels: 1,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-valley-chapel-annexe',
      name: 'Valley Chapel North Wing',
      type: 'house',
      cx: -3.1,
      cz: -12.0,
      w: 11.4,
      d: 6.4,
      angle: 16,
      eaves: 3.6,
      ridge: 5.4,
      levels: 1,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-vale-cottage',
      name: 'Vale Cottage',
      type: 'house',
      cx: 18.0,
      cz: -29.5,
      w: 12.4,
      d: 7.4,
      angle: -38,
      eaves: 5.2,
      ridge: 8.2,
      levels: 2,
      wall: 'render',
      roof: 'slate',
      shape: 'gabled',
      color: '#dce8dc', // Pale mint-green/cream painted render seen in Geograph #4421157
    },
    {
      id: 'bldg-vale-cottage-wing',
      type: 'outbuilding',
      cx: 27.5,
      cz: -36.5,
      w: 9.2,
      d: 6.2,
      angle: -32,
      eaves: 3.6,
      ridge: 5.5,
      levels: 1,
      wall: 'render',
      roof: 'slate',
      shape: 'gabled',
      color: '#dce8dc',
    },
    {
      id: 'bldg-brook-side',
      name: 'Brook Side',
      type: 'house',
      cx: 56.8,
      cz: -45.5,
      w: 14.2,
      d: 7.6,
      angle: 12,
      eaves: 5.1,
      ridge: 7.7,
      levels: 2,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-coppice-cottage',
      name: 'Coppice Cottage',
      type: 'house',
      cx: 81.7,
      cz: -49.4,
      w: 15.8,
      d: 10.2,
      angle: 14,
      eaves: 5.3,
      ridge: 8.5,
      levels: 2,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-coppice-outbuilding',
      type: 'outbuilding',
      cx: 76.0,
      cz: -63.5,
      w: 14.0,
      d: 5.8,
      angle: 14,
      eaves: 2.9,
      ridge: 4.3,
      levels: 1,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-wigland-lane-barn',
      type: 'barn',
      cx: 102.9,
      cz: -28.7,
      w: 12.9,
      d: 5.4,
      angle: -18,
      eaves: 3.1,
      ridge: 4.7,
      levels: 1,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-olivers-cottage',
      name: 'Olivers Cottage & Hill House',
      type: 'house',
      cx: 143.1,
      cz: -41.3,
      w: 17.8,
      d: 9.6,
      angle: -16,
      eaves: 5.2,
      ridge: 8.0,
      levels: 2,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-valley-paddock-west',
      type: 'farm_auxiliary',
      cx: 18.2,
      cz: 15.5,
      w: 16.0,
      d: 4.8,
      angle: 84,
      eaves: 2.8,
      ridge: 4.1,
      levels: 1,
      wall: 'farm_clad',
      roof: 'metal',
      shape: 'gabled',
    },
    {
      id: 'bldg-valley-paddock-east',
      type: 'farm_auxiliary',
      cx: 37.0,
      cz: 9.5,
      w: 12.5,
      d: 4.6,
      angle: 86,
      eaves: 2.8,
      ridge: 4.1,
      levels: 1,
      wall: 'farm_clad',
      roof: 'metal',
      shape: 'gabled',
    },
    {
      id: 'bldg-valley-paddock-shed',
      type: 'outbuilding',
      cx: 5.0,
      cz: 21.5,
      w: 6.0,
      d: 4.8,
      angle: 12,
      eaves: 2.7,
      ridge: 3.8,
      levels: 1,
      wall: 'timber',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-west-brook-stables-1',
      type: 'farm_auxiliary',
      cx: -35.3,
      cz: 17.7,
      w: 9.5,
      d: 6.0,
      angle: -46,
      eaves: 2.8,
      ridge: 4.1,
      levels: 1,
      wall: 'timber',
      roof: 'metal',
      shape: 'gabled',
    },
    {
      id: 'bldg-west-brook-stables-2',
      type: 'farm_auxiliary',
      cx: -26.2,
      cz: 23.7,
      w: 10.3,
      d: 9.5,
      angle: 44,
      eaves: 2.9,
      ridge: 4.3,
      levels: 1,
      wall: 'farm_clad',
      roof: 'metal',
      shape: 'gabled',
    },
    {
      id: 'bldg-wellmeadow-east-cottage',
      name: 'Wellmeadow Cottage',
      type: 'house',
      cx: 292.7,
      cz: 39.3,
      w: 16.5,
      d: 8.4,
      angle: 44,
      eaves: 4.6,
      ridge: 6.8,
      levels: 2,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },

    // =========================================================================
    // CLUSTER 2: Lower Wych Bridge, The Wychough & Lower Wych Road (Welsh / Cheshire Border)
    // Verified against Geograph #4421074 (commons-128746366.jpg), #4421126 (geograph_4421126.jpg),
    // #4421148 (commons-128747138.jpg), and 1m LIDAR DSM #31-#47
    // =========================================================================
    {
      id: 'bldg-wych-brook-cottage',
      name: 'Wych Brook Cottage',
      type: 'house',
      cx: -237.4,
      cz: 130.4,
      w: 12.5,
      d: 6.2,
      angle: -50,
      eaves: 4.8,
      ridge: 7.2,
      levels: 2,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-bridge-dutch-barn',
      name: 'Lower Lanes Farm Dutch Barn',
      type: 'barn',
      cx: -262.5,
      cz: 164.0,
      w: 18.5,
      d: 9.2,
      angle: 46,
      eaves: 4.8,
      ridge: 7.2,
      levels: 1,
      wall: 'farm_clad',
      roof: 'metal',
      shape: 'gabled',
      color: '#2b3230',
    },
    {
      id: 'bldg-bridge-stone-shippon',
      name: 'Lower Lanes Farm Shippon',
      type: 'farm_auxiliary',
      cx: -251.0,
      cz: 176.5,
      w: 14.5,
      d: 6.8,
      angle: 48,
      eaves: 3.8,
      ridge: 5.8,
      levels: 1,
      wall: 'stone',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-bridge-cattle-shed',
      type: 'farm_auxiliary',
      cx: -273.0,
      cz: 178.0,
      w: 24.0,
      d: 13.0,
      angle: 46,
      eaves: 4.0,
      ridge: 6.2,
      levels: 1,
      wall: 'farm_clad',
      roof: 'metal',
      shape: 'gabled',
    },
    {
      id: 'bldg-bridge-west-range',
      type: 'barn',
      cx: -285.0,
      cz: 168.0,
      w: 18.5,
      d: 8.0,
      angle: -44,
      eaves: 3.8,
      ridge: 5.6,
      levels: 1,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-the-haven-junction-house',
      name: 'The Haven',
      type: 'house',
      cx: -223.0,
      cz: 175.0,
      w: 11.5,
      d: 7.6,
      angle: -36,
      eaves: 5.6,
      ridge: 8.2,
      levels: 2,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-the-haven-annexe',
      type: 'outbuilding',
      cx: -232.2,
      cz: 168.2,
      w: 7.4,
      d: 5.5,
      angle: -44,
      eaves: 3.1,
      ridge: 4.7,
      levels: 1,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-brook-farm-cottage',
      name: 'Brook Farm Cottage',
      type: 'house',
      cx: -243.5,
      cz: 200.5,
      w: 12.2,
      d: 7.4,
      angle: 78,
      eaves: 4.5,
      ridge: 6.8,
      levels: 2,
      wall: 'render',
      roof: 'slate',
      shape: 'gabled',
      color: '#e2d2b8', // Warm cream render with slate roof (Rightmove #18552035 photo)
    },
    {
      id: 'bldg-lower-wych-road-shed',
      type: 'outbuilding',
      cx: -239.0,
      cz: 186.5,
      w: 8.8,
      d: 5.2,
      angle: -32,
      eaves: 3.6,
      ridge: 5.2,
      levels: 1,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-howberry-bungalow',
      name: 'Howberry Bungalow',
      type: 'house',
      cx: -252.5,
      cz: 225.8,
      w: 15.4,
      d: 6.2,
      angle: -22,
      eaves: 2.85,
      ridge: 4.45,
      levels: 1,
      wall: 'render',
      roof: 'slate',
      shape: 'gabled',
      color: '#e6d7ba', // Smooth cream/buff render with slate roof & L-shaped kitchen/double-garage courtyard wing
    },
    {
      id: 'bldg-lower-lanes-west-shed',
      name: 'Brook Farm Nursery Outbuilding',
      type: 'farm_auxiliary',
      cx: -274.0,
      cz: 230.5,
      w: 9.5,
      d: 5.8,
      angle: -22,
      eaves: 3.0,
      ridge: 4.3,
      levels: 1,
      wall: 'farm_clad',
      roof: 'metal',
      shape: 'gabled',
    },
    {
      id: 'bldg-lower-lanes-great-shed',
      type: 'farm_auxiliary',
      cx: -278.0,
      cz: 276.0,
      w: 26.0,
      d: 14.5,
      angle: -28,
      eaves: 4.5,
      ridge: 6.4,
      levels: 1,
      wall: 'farm_clad',
      roof: 'metal',
      shape: 'gabled',
    },
    {
      id: 'bldg-wigland-west-outbuilding',
      name: 'Wych Brook Cottage Outbuilding',
      type: 'outbuilding',
      cx: -197.7,
      cz: 180.3,
      w: 11.2,
      d: 6.2,
      angle: -36,
      eaves: 3.2,
      ridge: 4.8,
      levels: 1,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-wych-brook-east-cottage',
      name: 'Wych Brook Cottage (East)',
      type: 'house',
      cx: -161.8,
      cz: 181.2,
      w: 14.5,
      d: 8.2,
      angle: -12,
      eaves: 4.8,
      ridge: 7.4,
      levels: 2,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-the-graigs',
      name: 'The Graigs',
      type: 'house',
      cx: -57.3,
      cz: 172.0,
      w: 12.3,
      d: 7.5,
      angle: -38,
      eaves: 4.6,
      ridge: 7.0,
      levels: 2,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-bishop-bennet-barn',
      type: 'barn',
      cx: -25.5,
      cz: 182.1,
      w: 20.2,
      d: 9.5,
      angle: 36,
      eaves: 3.8,
      ridge: 5.8,
      levels: 1,
      wall: 'farm_clad',
      roof: 'slate',
      shape: 'gabled',
    },

    // =========================================================================
    // CLUSTER 3: Hill Farm & Beech View (Northern Ridge off The Wychough)
    // Verified against Geograph #4420947 (geograph_4420947.jpg), OS 1:10,000 map ("Beech View", "Hill Farm"),
    // and 1m LIDAR DSM #3-#10
    // =========================================================================
    {
      id: 'bldg-beech-view',
      name: 'Beech View',
      type: 'house',
      cx: -174.0,
      cz: -134.5,
      w: 13.8,
      d: 8.6,
      angle: 4,
      eaves: 4.2,
      ridge: 6.8,
      levels: 2,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-beech-view-garage',
      type: 'outbuilding',
      cx: -161.5,
      cz: -139.0,
      w: 6.2,
      d: 5.2,
      angle: 4,
      eaves: 3.2,
      ridge: 4.8,
      levels: 1,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-hill-farm-barn-west',
      name: 'Hill Farm Courtyard Barn (West)',
      type: 'barn',
      cx: -149.5,
      cz: -159.5,
      w: 19.5,
      d: 6.6,
      angle: 88,
      eaves: 4.8,
      ridge: 7.2,
      levels: 2,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-hill-farm-barn-north',
      name: 'Hill Farm Courtyard Barn (North)',
      type: 'barn',
      cx: -136.5,
      cz: -167.0,
      w: 24.5,
      d: 6.8,
      angle: -2,
      eaves: 4.8,
      ridge: 7.2,
      levels: 2,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-hill-farm-dairy',
      type: 'barn',
      cx: -107.2,
      cz: -175.2,
      w: 11.5,
      d: 6.5,
      angle: -8,
      eaves: 3.6,
      ridge: 5.2,
      levels: 1,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-hill-farm-north-shed',
      name: 'Hill Farm Agricultural Shed',
      type: 'farm_auxiliary',
      cx: -88.7,
      cz: -186.3,
      w: 24.0,
      d: 12.5,
      angle: -60,
      eaves: 4.0,
      ridge: 5.8,
      levels: 1,
      wall: 'farm_clad',
      roof: 'metal',
      shape: 'gabled',
    },
    {
      id: 'bldg-hill-farm-house',
      name: 'Hill Farm House',
      type: 'house',
      cx: -87.6,
      cz: -134.0,
      w: 18.0,
      d: 8.2,
      angle: -2,
      eaves: 5.4,
      ridge: 8.2,
      levels: 2,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
    {
      id: 'bldg-hill-farm-courtyard-shed',
      type: 'outbuilding',
      cx: -99.0,
      cz: -153.0,
      w: 5.5,
      d: 5.0,
      angle: -4,
      eaves: 3.2,
      ridge: 4.5,
      levels: 1,
      wall: 'brick',
      roof: 'slate',
      shape: 'gabled',
    },
  ];

  for (const b of hamletBuildings) {
    buildings.push({
      id: b.id,
      name: b.name,
      type: b.type,
      footprint: makeRectFootprint(b.cx, b.cz, b.w, b.d, b.angle),
      center: [b.cx, b.cz],
      eavesHeight: b.eaves,
      ridgeHeight: b.ridge,
      levels: b.levels,
      wallMaterial: b.wall,
      roofMaterial: b.roof,
      roofShape: b.shape,
      WallColorHex: b.color,
      tags: { building: b.type, ...(b.name ? { name: b.name } : {}) },
    });
  }

  // Add Howberry Bungalow tarmac driveway connecting Lower Wych Road into the courtyard
  roads.push({
    id: 'way-howberry-driveway',
    name: 'Howberry Bungalow Driveway',
    highway: 'service',
    category: 'country_lane',
    surface: 'asphalt',
    width: 4.4,
    bridge: false,
    points: [
      [-235.8, 232.3],
      [-239.8, 234.0],
    ],
  });

  // Generate roadside & field-boundary hawthorn hedgerows (as seen in Geograph 4421061 & 2362181)
  // Keep generous gaps near road intersections, bridges, and building frontages
  for (const road of roads) {
    if (road.bridge) continue;
    if (road.category !== 'primary_lane' && road.category !== 'country_lane' && road.category !== 'track') {
      continue;
    }
    const offset = road.width * 0.5 + 1.4;
    for (const side of [-1, 1]) {
      let currentRun: [number, number][] = [];
      for (let i = 0; i < road.points.length - 1; i++) {
        const [x1, z1] = road.points[i];
        const [x2, z2] = road.points[i + 1];
        const segLen = Math.hypot(x2 - x1, z2 - z1);
        if (segLen < 1) continue;
        const nx = (-(z2 - z1) / segLen) * side;
        const nz = ((x2 - x1) / segLen) * side;
        const steps = Math.max(1, Math.ceil(segLen / 6));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const px = x1 + (x2 - x1) * t + nx * offset;
          const pz = z1 + (z2 - z1) * t + nz * offset;
          if (Math.abs(px) > HALF_BOX_M - 5 || Math.abs(pz) > HALF_BOX_M - 5) continue;

          // Check clearance from other roads/driveways and buildings
          let clear = true;
          for (const other of roads) {
            if (other.id === road.id) continue;
            if (minDistToPolyline(px, pz, other.points) < other.width * 0.6 + 2.5) {
              clear = false;
              break;
            }
          }
          if (clear) {
            for (const bldg of buildings) {
              if (Math.hypot(px - bldg.center[0], pz - bldg.center[1]) < 22) {
                clear = false;
                break;
              }
            }
          }
          if (clear) {
            currentRun.push([Number(px.toFixed(2)), Number((pz).toFixed(2))]);
          } else {
            if (currentRun.length >= 2) {
              barriers.push({
                id: `hedge-${road.id}-${side}-${i}-${s}`,
                type: 'hedge',
                height: 1.18,
                width: 1.25,
                points: currentRun,
              });
            }
            currentRun = [];
          }
        }
      }
      if (currentRun.length >= 2) {
        barriers.push({
          id: `hedge-${road.id}-${side}-end`,
          type: 'hedge',
          height: 1.18,
          width: 1.25,
          points: currentRun,
        });
      }
    }
  }

  // Add the high farmyard wall on the north side of the Hill Farm entrance driveway (Geograph #4420947)
  // and the low sandstone garden wall along Wigland Hall Lane in front of Brook Side (Geograph #4421157)
  barriers.push(
    {
      id: 'wall-hill-farm-entrance-north',
      type: 'wall',
      height: 1.65,
      width: 0.4,
      points: [
        [-188.0, -157.5],
        [-153.0, -153.5],
      ],
    },
    {
      id: 'wall-brook-side-roadside',
      type: 'wall',
      height: 0.78,
      width: 0.38,
      points: [
        [45.0, -38.8],
        [57.2, -39.8],
        [68.0, -39.5],
      ],
    }
  );

  // Add pastoral field boundary hedgerows across the valley slopes matching ref_aerial_600m.png
  const fieldHedges: [number, number][][] = [
    [[-110, -280], [-95, -200]],
    [[20, -280], [18, -110], [15, -45]],
    [[145, -260], [120, -95], [108, -58]],
    [[-85, 165], [-45, 225], [-10, 285]],
    [[45, 55], [85, 165], [125, 280]],
    [[155, -10], [195, 110], [245, 260]],
  ];
  fieldHedges.forEach((pts, idx) => {
    barriers.push({
      id: `field-hedge-${idx}`,
      type: 'hedge',
      height: 1.45,
      width: 1.35,
      points: pts,
    });
  });

  // Generate trees (Woodland polygons, riparian Wych Brook/Shothill Brook alders & willows, hedgerow oaks)
  const rng = mulberry32(147901);
  const trees: TreePoint[] = [
    // Landmark riparian trees flanking Lower Wych Bridge (matching Wikimedia Commons "Lower Wych Bridge 01" & Geograph #4421074)
    { x: -282.5, z: 120.5, scale: 1.25, species: 'alder' },
    { x: -270.0, z: 124.0, scale: 1.15, species: 'willow' },
    { x: -291.5, z: 133.5, scale: 1.3, species: 'oak' },
    { x: -296.0, z: 119.0, scale: 1.2, species: 'ash' },
    // Mature oak tree at the entrance to Beech View / Hill Farm (prominent on right of Geograph #4420947)
    { x: -183.5, z: -145.5, scale: 1.35, species: 'oak' },
    { x: -75.0, z: -136.0, scale: 1.2, species: 'ash' },
    // Tall conifers & garden trees along Wigland Hall Lane bend (seen in Geograph #4421157 between Brook Side & Coppice Cottage)
    { x: 67.5, z: -43.5, scale: 1.4, species: 'alder' },
    { x: 70.0, z: -46.0, scale: 1.3, species: 'oak' },
    { x: -12.0, z: -18.0, scale: 1.15, species: 'ash' },
  ];
  const speciesList: TreePoint['species'][] = ['oak', 'ash', 'alder', 'hawthorn', 'willow'];

  const isPointClearForTree = (x: number, z: number): boolean => {
    if (Math.abs(x) > HALF_BOX_M - 8 || Math.abs(z) > HALF_BOX_M - 8) return false;
    for (const r of roads) {
      if (minDistToPolyline(x, z, r.points) < r.width * 0.5 + 4.5) return false;
    }
    for (const b of buildings) {
      if (Math.hypot(x - b.center[0], z - b.center[1]) < 16) return false;
    }
    return true;
  };

  // 1. Woodland trees inside OSM landuse=forest polygons (Wellmeadow Wood, Scholar's Wood, Cae Du Wood, Stockton Dingle)
  for (const lu of landuse) {
    if (lu.type !== 'woodland') continue;
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const [px, pz] of lu.polygon) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;
    }
    minX = Math.max(-HALF_BOX_M + 5, minX);
    maxX = Math.min(HALF_BOX_M - 5, maxX);
    minZ = Math.max(-HALF_BOX_M + 5, minZ);
    maxZ = Math.min(HALF_BOX_M - 5, maxZ);

    const area = Math.max(0, (maxX - minX) * (maxZ - minZ));
    const attempts = Math.min(900, Math.floor(area / 55));
    for (let i = 0; i < attempts; i++) {
      const tx = minX + rng() * (maxX - minX);
      const tz = minZ + rng() * (maxZ - minZ);
      if (pointInPolygon(tx, tz, lu.polygon) && isPointClearForTree(tx, tz)) {
        trees.push({
          x: Number(tx.toFixed(2)),
          z: Number(tz.toFixed(2)),
          scale: Number((0.75 + rng() * 0.65).toFixed(2)),
          species: speciesList[Math.floor(rng() * 3)],
        });
      }
    }
  }

  // 2. Riparian trees along Wych Brook & Shothill Brook
  for (const w of water) {
    if (w.isPolygon) continue;
    for (let i = 0; i < w.points.length - 1; i++) {
      const [x1, z1] = w.points[i];
      const [x2, z2] = w.points[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const count = Math.floor(len / 16);
      for (let k = 0; k < count; k++) {
        const t = rng();
        const side = rng() > 0.5 ? 1 : -1;
        const dist = 4.0 + rng() * 6.0;
        const tx = x1 + (x2 - x1) * t + side * dist;
        const tz = z1 + (z2 - z1) * t + (rng() - 0.5) * 4.0;
        if (isPointClearForTree(tx, tz)) {
          trees.push({
            x: Number(tx.toFixed(2)),
            z: Number(tz.toFixed(2)),
            scale: Number((0.7 + rng() * 0.6).toFixed(2)),
            species: rng() > 0.4 ? 'alder' : 'willow',
          });
        }
      }
    }
  }

  // 3. Mature boundary oaks along hedgerows
  for (const bar of barriers) {
    if (bar.type !== 'hedge') continue;
    for (let i = 0; i < bar.points.length; i += 6) {
      if (rng() > 0.35) continue;
      const [hx, hz] = bar.points[i];
      if (isPointClearForTree(hx, hz)) {
        trees.push({
          x: hx,
          z: hz,
          scale: Number((0.85 + rng() * 0.65).toFixed(2)),
          species: rng() > 0.35 ? 'oak' : 'hawthorn',
        });
      }
    }
  }

  // Official Place & House Labels (from Ordnance Survey 1:2,500/1:10,000, Royal Mail PAF, and OSM)
  labels.push(
    {
      id: 'lbl-lower-wych',
      name: 'Lower Wych',
      subtitle: 'Hamlet • SY14 7JX (Cheshire / Wrexham Border)',
      category: 'hamlet',
      x: -102.4,
      z: 68.1,
      elevationOffset: 10,
    },
    {
      id: 'lbl-lower-wych-bridge',
      name: 'Lower Wych Bridge',
      subtitle: 'Grade II Listed Border Bridge (Wikidata Q29507102)',
      category: 'landmark',
      x: -279.5,
      z: 132.0,
      elevationOffset: 5.5,
    },
    {
      id: 'lbl-valley-chapel',
      name: 'Valley Chapel (SY14 7JX)',
      subtitle: 'Converted Primitive Methodist Chapel • E 348770, N 344554',
      category: 'landmark',
      x: -1.6,
      z: -0.7,
      elevationOffset: 9.0,
    },
    {
      id: 'lbl-howberry-bungalow',
      name: 'Howberry Bungalow (SY14 7JX)',
      subtitle: 'Lower Wych Road • Detached L-Shaped Bungalow & Double Garage',
      category: 'landmark',
      x: -252.5,
      z: 225.8,
      elevationOffset: 7.5,
    },
    {
      id: 'lbl-brook-farm-cottage',
      name: 'Brook Farm Cottage',
      subtitle: 'Lower Wych Road • SY14 7JX',
      category: 'building',
      x: -243.5,
      z: 200.5,
      elevationOffset: 8.5,
    },
    {
      id: 'lbl-vale-cottage',
      name: 'Vale Cottage',
      subtitle: 'Wigland Hall Lane • SY14 7JX (Geograph #4421157)',
      category: 'building',
      x: 18.0,
      z: -29.5,
      elevationOffset: 9.5,
    },
    {
      id: 'lbl-brook-side',
      name: 'Brook Side',
      subtitle: 'Wigland Hall Lane • SY14 7JX (Geograph #4421157)',
      category: 'building',
      x: 56.8,
      z: -45.5,
      elevationOffset: 9.5,
    },
    {
      id: 'lbl-coppice-cottage',
      name: 'Coppice Cottage',
      subtitle: 'Wigland Hall Lane • SY14 7JX',
      category: 'building',
      x: 81.7,
      z: -49.4,
      elevationOffset: 9.5,
    },
    {
      id: 'lbl-olivers-cottage',
      name: 'Olivers Cottage & Hill House',
      subtitle: 'Wigland Hall Lane • SY14 7JX',
      category: 'building',
      x: 143.1,
      z: -41.3,
      elevationOffset: 9.5,
    },
    {
      id: 'lbl-the-haven',
      name: 'The Haven & Lower Lanes Farm',
      subtitle: 'Junction of The Wychough & Lower Wych Road (Geograph #4421074 & #4421126)',
      category: 'building',
      x: -223.0,
      z: 175.0,
      elevationOffset: 9.5,
    },
    {
      id: 'lbl-dutch-barn',
      name: 'Lower Lanes Farm Dutch Barn',
      subtitle: 'The Wychough • Geograph #4421074',
      category: 'building',
      x: -262.5,
      z: 164.0,
      elevationOffset: 8.5,
    },
    {
      id: 'lbl-wych-brook-cottage',
      name: 'Wych Brook Cottage',
      subtitle: 'The Wychough • Lower Wych',
      category: 'building',
      x: -237.4,
      z: 130.4,
      elevationOffset: 8.5,
    },
    {
      id: 'lbl-the-graigs',
      name: 'The Graigs',
      subtitle: 'The Bishop Bennet Way (Geograph #4421148)',
      category: 'building',
      x: -57.3,
      z: 172.0,
      elevationOffset: 8.5,
    },
    {
      id: 'lbl-beech-view',
      name: 'Beech View',
      subtitle: 'Hill Farm Entrance • SY14 7JX (OS 1:10,000 & Geograph #4420947)',
      category: 'building',
      x: -174.0,
      z: -134.5,
      elevationOffset: 8.5,
    },
    {
      id: 'lbl-hill-farm',
      name: 'Hill Farm',
      subtitle: 'Historic Farmhouse & Courtyard Barns (Geograph #4420947)',
      category: 'building',
      x: -87.6,
      z: -134.0,
      elevationOffset: 9.5,
    },
    {
      id: 'lbl-wellmeadow-wood',
      name: 'Wellmeadow Wood & Stockton Dingle',
      subtitle: 'Ancient Semi-Natural Valley Woodland (OS 1:10,000)',
      category: 'landmark',
      x: 165.0,
      z: -120.0,
      elevationOffset: 10.0,
    },
    {
      id: 'lbl-scholars-wood',
      name: "Scholar's Wood & Cae Du Wood",
      subtitle: 'Wych Brook Valley Woodland (OS 1:10,000)',
      category: 'landmark',
      x: 65.0,
      z: 110.0,
      elevationOffset: 10.0,
    },
    {
      id: 'lbl-wych-brook',
      name: 'Wych Brook',
      subtitle: 'Historic England (Cheshire) – Wales (Wrexham) Border',
      category: 'water',
      x: -132.8,
      z: 144.1,
      elevationOffset: 4.5,
    },
    {
      id: 'lbl-shothill-brook',
      name: 'Shothill Brook',
      subtitle: 'Tributary Stream in Wooded Valley',
      category: 'water',
      x: -60.0,
      z: 240.0,
      elevationOffset: 4.5,
    },
    {
      id: 'lbl-lower-wych-road',
      name: 'Lower Wych Road (C146)',
      subtitle: 'Wrexham Border Lane (Geograph #4421126)',
      category: 'street',
      x: -236.0,
      z: 220.0,
      elevationOffset: 4.5,
    },
    {
      id: 'lbl-the-wychough',
      name: 'The Wychough',
      subtitle: 'Country Lane over Lower Wych Bridge',
      category: 'street',
      x: -252.6,
      z: 155.7,
      elevationOffset: 4.5,
    },
    {
      id: 'lbl-wigland-hall-lane',
      name: 'Wigland Hall Lane',
      subtitle: 'Hamlet Lane through SY14 7JX',
      category: 'street',
      x: 15.8,
      z: 59.4,
      elevationOffset: 4.5,
    },
    {
      id: 'lbl-bishop-bennet-way',
      name: 'The Bishop Bennet Way (Wigland FP 5)',
      subtitle: 'Public Footpath & Long-Distance Trail',
      category: 'street',
      x: -42.0,
      z: 170.0,
      elevationOffset: 4.5,
    }
  );

  // Curated camera viewpoints matching the exact photographer locations & bearings of the Geograph / Wikimedia Commons / Property photos
  const viewpoints: ViewpointPreset[] = [
    {
      id: 'vp-howberry-bungalow',
      name: '1. Howberry Bungalow (Lower Wych Road, SY14 7JX)',
      description:
        'Looking WNW across the tarmac courtyard of Howberry Bungalow at the cream-rendered bungalow, Georgian-bar windows, French patio doors, Velux skylights, attached double garage, and red-brick trellis wall.',
      x: -238.5,
      z: 235.5,
      yawDeg: 298,
      pitchDeg: 2,
      referenceSource: 'OS Grid SJ 48520 44325 & Rightmove #17127317 (Howberry Bungalow)',
    },
    {
      id: 'vp-wrexham-road-north',
      name: '2. Lower Wych Road Looking North (Brook Farm Cottage & The Haven)',
      description:
        'Looking north up Lower Wych Road from outside Howberry Bungalow past Brook Farm Cottage on the left and 2-storey red-brick The Haven on the right.',
      x: -233.5,
      z: 208.0,
      yawDeg: 10,
      pitchDeg: 2,
      referenceSource: 'Geograph #4421126 "Lower Wych, Wrexham County" (Jeff Buck)',
    },
    {
      id: 'vp-hamlet-centre',
      name: '3. SY14 7JX: Valley Chapel, Vale Cottage & Brook Side',
      description:
        'On Wigland Hall Lane looking WSW around the bend past red-brick Brook Side and pale-green rendered Vale Cottage on the right towards red-brick Valley Chapel (SY14 7JX) on the left.',
      x: 78.0,
      z: -36.0,
      yawDeg: 254,
      pitchDeg: 2,
      referenceSource: 'Geograph #4421157 "The Bishop Bennet Way at Lower Wych" (Jeff Buck)',
    },
    {
      id: 'vp-hill-farm-entrance',
      name: '4. Entrance to Hill Farm & Beech View',
      description:
        'Looking east down the Hill Farm driveway off The Wychough between the high red-brick farmyard wall on the left and Beech View + mature oak tree + double garage on the right.',
      x: -194.0,
      z: -153.5,
      yawDeg: 94,
      pitchDeg: 2,
      referenceSource: 'Geograph #4420947 "Entrance to Hill Farm" (Jeff Buck)',
    },
    {
      id: 'vp-lower-wych-bridge',
      name: '5. Lower Wych Bridge (Grade II Listed)',
      description:
        'Looking NW across the Grade II listed sandstone ashlar parapets of Lower Wych Bridge over Wych Brook (England–Wales border).',
      x: -268.5,
      z: 139.8,
      yawDeg: 305,
      pitchDeg: 2,
      referenceSource: 'Wikimedia Commons "Lower Wych Bridge 01" (Dave.Dunford, Q29507102)',
    },
  ];

  // Generate 1024 x 1024 draped land-cover PNG texture
  const TEX_SIZE = 1024;
  const png = new PNG({ width: TEX_SIZE, height: TEX_SIZE });

  console.log(`Synthesizing ${TEX_SIZE}x${TEX_SIZE} draped land-cover texture from OSM & EA LIDAR DTM...`);
  for (let py = 0; py < TEX_SIZE; py++) {
    const v = py / (TEX_SIZE - 1);
    const z = -HALF_BOX_M + v * BOX_SIZE_M;
    for (let px = 0; px < TEX_SIZE; px++) {
      const u = px / (TEX_SIZE - 1);
      const x = -HALF_BOX_M + u * BOX_SIZE_M;

      const elev = sampleTerrainHeight(terrain, x, z);
      const elevNorm = (elev - terrain.minElevation) / Math.max(1, terrain.maxElevation - terrain.minElevation);

      // Multi-frequency procedural field/grass variation
      const n1 = Math.sin(x * 0.045 + z * 0.032) * Math.cos(x * 0.028 - z * 0.051);
      const n2 = Math.sin(x * 0.21 + z * 0.17) * 0.5 + Math.cos(x * 0.37 - z * 0.29) * 0.5;
      const mowStripe = Math.sin((x * 0.8 + z * 0.55) * 0.35) * 3.5;

      // Distinct field tint between Cheshire side (N/E) and Welsh side (S/W) and individual field enclosures
      const fieldId = Math.floor((x + 350) / 140) + Math.floor((z + 350) / 130) * 3;
      const fieldWarmth = ((fieldId % 3) - 1) * 6;

      // Base lush Cheshire/Welsh pasture green
      let r = 82 + elevNorm * 22 + fieldWarmth + n1 * 7 + n2 * 4 + mowStripe;
      let g = 118 + elevNorm * 20 + fieldWarmth * 0.6 + n1 * 9 + n2 * 5 + mowStripe;
      let b = 56 + elevNorm * 10 + n1 * 4 + n2 * 3;

      // Check woodland polygons
      for (const lu of landuse) {
        if (lu.type === 'woodland' && pointInPolygon(x, z, lu.polygon)) {
          r = 46 + n1 * 6 + n2 * 4;
          g = 68 + n1 * 7 + n2 * 4;
          b = 36 + n1 * 4;
          break;
        }
      }

      // Check riparian zone near Wych Brook & Shothill Brook
      for (const w of water) {
        if (w.isPolygon) continue;
        const d = minDistToPolyline(x, z, w.points);
        if (d < w.width * 0.65) {
          // Stream bed (dark slate/pebble under water shader)
          r = 38;
          g = 52;
          b = 48;
        } else if (d < w.width + 6.5) {
          const blend = (d - w.width * 0.65) / (w.width * 0.35 + 6.5);
          r = r * blend + 58 * (1 - blend);
          g = g * blend + 84 * (1 - blend);
          b = b * blend + 44 * (1 - blend);
        }
      }

      // Check farmyard / garden aprons around buildings
      for (const bldg of buildings) {
        const d = Math.hypot(x - bldg.center[0], z - bldg.center[1]);
        if (d < 16) {
          const blend = Math.min(1, Math.max(0, (d - 6) / 10));
          const yardR = bldg.type === 'barn' || bldg.type === 'farm_auxiliary' ? 118 : 74;
          const yardG = bldg.type === 'barn' || bldg.type === 'farm_auxiliary' ? 112 : 106;
          const yardB = bldg.type === 'barn' || bldg.type === 'farm_auxiliary' ? 98 : 54;
          r = r * blend + yardR * (1 - blend);
          g = g * blend + yardG * (1 - blend);
          b = b * blend + yardB * (1 - blend);
        }
      }

      // Bake Howberry Bungalow's tarmac parking courtyard directly into the terrain texture
      {
        const dxH = x - -252.5;
        const dzH = z - 225.8;
        const cosH = Math.cos((22 * Math.PI) / 180);
        const sinH = Math.sin((22 * Math.PI) / 180);
        const lxH = dxH * cosH - dzH * sinH;
        const lzH = dxH * sinH + dzH * cosH;
        if (lxH >= -2.5 && lxH <= 11.2 && lzH >= 2.6 && lzH <= 15.6) {
          r = 56 + n2 * 2;
          g = 58 + n2 * 2;
          b = 63 + n2 * 2;
        }
      }

      // Check road verges & tracks baked subtly into the terrain texture
      for (const road of roads) {
        const d = minDistToPolyline(x, z, road.points);
        if (d < road.width * 0.65 + 1.5) {
          if (road.category === 'footpath' || road.category === 'bridleway') {
            if (d < 1.1) {
              r = 116 + n2 * 6;
              g = 98 + n2 * 5;
              b = 72 + n2 * 4;
            }
          } else if (road.category === 'track') {
            if (d < 1.6) {
              r = 124 + n2 * 6;
              g = 112 + n2 * 5;
              b = 90 + n2 * 4;
            }
          } else {
            // Country lane tarmac & grassy verge
            if (d < road.width * 0.5) {
              r = 92 + n2 * 4;
              g = 93 + n2 * 4;
              b = 96 + n2 * 4;
            } else {
              r = 68;
              g = 98;
              b = 45;
            }
          }
        }
      }

      const idx = (py * TEX_SIZE + px) << 2;
      png.data[idx] = Math.max(0, Math.min(255, Math.round(r)));
      png.data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      png.data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      png.data[idx + 3] = 255;
    }
  }

  const pngBuffer = PNG.sync.write(png);
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'landcover.png'), pngBuffer);
  console.log(`Wrote public/data/landcover.png (${(pngBuffer.length / 1024).toFixed(1)} KB)`);

  // Write terrain.json (omit dsmHeights if identical to heights to save payload size)
  const cleanTerrain: TerrainData = {
    width: terrain.width,
    depth: terrain.depth,
    gridCols: terrain.gridCols,
    gridRows: terrain.gridRows,
    minElevation: terrain.minElevation,
    maxElevation: terrain.maxElevation,
    source: terrain.source,
    licence: terrain.licence,
    heights: terrain.heights,
  };
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'terrain.json'), JSON.stringify(cleanTerrain));

  const featuresData: WorldFeaturesData = {
    centre: {
      postcode: POSTCODE,
      lat: CENTRE_WGS84.lat,
      lon: CENTRE_WGS84.lon,
      easting: CENTRE_BNG.easting,
      northing: CENTRE_BNG.northing,
    },
    bbox: {
      ...BBOX_WGS84,
      ...BBOX_BNG,
    },
    buildings,
    roads,
    barriers,
    water,
    landuse,
    trees,
    labels,
    viewpoints,
  };

  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'features.json'), JSON.stringify(featuresData, null, 2));
  console.log(
    `Wrote public/data/features.json: ${buildings.length} buildings, ${roads.length} roads/paths, ${water.length} water features, ${barriers.length} hedges/walls, ${trees.length} trees, ${labels.length} labels`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
