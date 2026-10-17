import * as THREE from 'three';
import type { LinearBarrierFeature, RoadFeature } from '../types.ts';
import type { ArchitecturalMaterials } from './Materials.ts';
import type { TerrainSystem } from './Terrain.ts';

export class RoadsAndPathsSystem {
  public readonly group = new THREE.Group();

  constructor(
    roads: RoadFeature[],
    barriers: LinearBarrierFeature[],
    terrain: TerrainSystem,
    materials: ArchitecturalMaterials
  ) {
    this.group.name = 'LowerWychRoadsAndBridges';

    const asphaltMat = this.createRoadMaterial('#595b5e', '#45484b', 0.86);
    const laneMat = this.createRoadMaterial('#626365', '#4c5247', 0.88);
    const gravelMat = this.createRoadMaterial('#827868', '#686252', 0.94);
    const footpathMat = this.createRoadMaterial('#7d6b52', '#5b6c43', 0.96);

    for (const road of roads) {
      let mat = laneMat;
      let yOffset = 0.08;
      if (road.category === 'primary_lane') {
        mat = asphaltMat;
        yOffset = 0.09;
      } else if (road.category === 'footpath' || road.category === 'bridleway') {
        mat = footpathMat;
        yOffset = 0.06;
      } else if (road.category === 'track' || road.category === 'driveway') {
        mat = gravelMat;
        yOffset = 0.07;
      }

      if (road.bridge) {
        this.buildStoneBridge(road, terrain, materials);
      }
      const mesh = this.createDrapedRibbon(road.points, road.width, yOffset, terrain, mat, road.bridge);
      if (mesh) {
        mesh.name = road.id;
        this.group.add(mesh);
      }
    }

    // Build stone parapet walls and wooden field fences from barriers (skipping bridge parapets already built by buildStoneBridge)
    for (const bar of barriers) {
      if (bar.type === 'wall' && !bar.id.startsWith('bridge-parapet-')) {
        const wallMesh = this.createExtrudedWall(
          bar.points,
          bar.width,
          bar.height,
          terrain,
          materials.bridgeStoneMaterial
        );
        if (wallMesh) this.group.add(wallMesh);
      }
    }

    // Add rural roadside telegraph poles along the lanes (seen in Geograph #4421061 & #4421074)
    this.addTelegraphPoles(roads, terrain);
  }

  private subdividePolyline(pts: [number, number][], maxStep = 2.0): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i];
      const [x2, z2] = pts[i + 1];
      const dist = Math.hypot(x2 - x1, z2 - z1);
      const steps = Math.max(1, Math.ceil(dist / maxStep));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        out.push([x1 + (x2 - x1) * t, z1 + (z2 - z1) * t]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  private createDrapedRibbon(
    rawPts: [number, number][],
    width: number,
    yOffset: number,
    terrain: TerrainSystem,
    material: THREE.Material,
    isBridge = false
  ): THREE.Mesh | null {
    // Filter points roughly within the 600m x 600m terrain box
    const clipped = rawPts.filter(([x, z]) => Math.abs(x) <= 305 && Math.abs(z) <= 305);
    if (clipped.length < 2) return null;

    const pts = this.subdividePolyline(clipped, 1.8);
    if (pts.length < 2) return null;

    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    let distAccum = 0;
    const halfW = width * 0.5;
    const startBankY = terrain.getHeightAt(pts[0][0], pts[0][1]);
    const endBankY = terrain.getHeightAt(pts[pts.length - 1][0], pts[pts.length - 1][1]);

    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      if (i > 0) {
        distAccum += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      }

      // Compute smooth tangent
      let tx = 0,
        tz = 0;
      if (i < pts.length - 1) {
        tx += pts[i + 1][0] - x;
        tz += pts[i + 1][1] - z;
      }
      if (i > 0) {
        tx += x - pts[i - 1][0];
        tz += z - pts[i - 1][1];
      }
      const len = Math.hypot(tx, tz) || 1;
      const nx = -tz / len;
      const nz = tx / len;

      const lx = x + nx * halfW;
      const lz = z + nz * halfW;
      const rx = x - nx * halfW;
      const rz = z - nz * halfW;

      const frac = pts.length > 1 ? i / (pts.length - 1) : 0;
      const bridgeY = startBankY + (endBankY - startBankY) * frac + Math.sin(frac * Math.PI) * 0.12;

      const ly = (isBridge ? bridgeY : terrain.getHeightAt(lx, lz)) + yOffset;
      const cy = (isBridge ? bridgeY : terrain.getHeightAt(x, z)) + yOffset + 0.03; // Slight road camber
      const ry = (isBridge ? bridgeY : terrain.getHeightAt(rx, rz)) + yOffset;

      positions.push(lx, ly, lz, x, cy, z, rx, ry, rz);
      const v = distAccum / width;
      uvs.push(0, v, 0.5, v, 1, v);

      if (i < pts.length - 1) {
        const base = i * 3;
        indices.push(base, base + 3, base + 1);
        indices.push(base + 1, base + 3, base + 4);
        indices.push(base + 1, base + 4, base + 2);
        indices.push(base + 2, base + 4, base + 5);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute('uv' in geom ? uvs : uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Builds the Grade II listed sandstone Lower Wych Bridge & Wigland Hall Lane bridge
   * (matching Wikimedia Commons "Lower Wych Bridge 01" & Geograph #4421074)
   */
  private buildStoneBridge(
    road: RoadFeature,
    terrain: TerrainSystem,
    materials: ArchitecturalMaterials
  ) {
    if (road.points.length < 2) return;
    const p0 = road.points[0];
    const p1 = road.points[road.points.length - 1];
    const cx = (p0[0] + p1[0]) * 0.5;
    const cz = (p0[1] + p1[1]) * 0.5;
    const dx = p1[0] - p0[0];
    const dz = p1[1] - p0[1];
    const spanLen = Math.hypot(dx, dz) + 1.8;
    const angle = Math.atan2(dz, dx);

    const bankElev =
      (terrain.getHeightAt(p0[0], p0[1]) + terrain.getHeightAt(p1[0], p1[1])) * 0.5;

    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(cx, bankElev, cz);
    bridgeGroup.rotation.y = -angle;

    // Stone arch spandrel / soffit underneath the draped roadway
    const deckGeom = new THREE.BoxGeometry(spanLen, 0.45, road.width + 0.85);
    const deckMesh = new THREE.Mesh(deckGeom, materials.bridgeStoneMaterial);
    deckMesh.position.y = -0.26;
    deckMesh.receiveShadow = true;
    deckMesh.castShadow = true;
    bridgeGroup.add(deckMesh);

    // Sandstone ashlar parapet walls on both sides with rounded coping stones (Lower Wych Bridge 01)
    const parapetH = 1.05;
    const parapetThick = 0.42;
    const parapetGeom = new THREE.BoxGeometry(spanLen + 1.2, parapetH, parapetThick);

    for (const side of [-1, 1]) {
      const pz = side * (road.width * 0.5 + parapetThick * 0.5 + 0.08);
      const wall = new THREE.Mesh(parapetGeom, materials.bridgeStoneMaterial);
      wall.position.set(0, parapetH * 0.5, pz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      bridgeGroup.add(wall);

      // Coping stone cap
      const copingGeom = new THREE.BoxGeometry(spanLen + 1.4, 0.16, parapetThick + 0.08);
      const coping = new THREE.Mesh(copingGeom, materials.bridgeStoneMaterial);
      coping.position.set(0, parapetH + 0.06, pz);
      coping.castShadow = true;
      bridgeGroup.add(coping);
    }

    this.group.add(bridgeGroup);
  }

  private createExtrudedWall(
    rawPts: [number, number][],
    width: number,
    height: number,
    terrain: TerrainSystem,
    material: THREE.Material
  ): THREE.Group | null {
    const pts = rawPts.filter(([x, z]) => Math.abs(x) <= 300 && Math.abs(z) <= 300);
    if (pts.length < 2) return null;
    const g = new THREE.Group();
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i];
      const [x2, z2] = pts[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len < 0.2) continue;
      const cx = (x1 + x2) * 0.5;
      const cz = (z1 + z2) * 0.5;
      const y = Math.max(terrain.getHeightAt(x1, z1), terrain.getHeightAt(x2, z2));
      const geom = new THREE.BoxGeometry(len, height, width);
      const mesh = new THREE.Mesh(geom, material);
      mesh.position.set(cx, y + height * 0.5, cz);
      mesh.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    return g;
  }

  private addTelegraphPoles(roads: RoadFeature[], terrain: TerrainSystem) {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x6e5c49, roughness: 0.9 });
    const poleGeom = new THREE.CylinderGeometry(0.11, 0.15, 7.8, 8);
    const barGeom = new THREE.BoxGeometry(1.1, 0.08, 0.08);

    for (const r of roads) {
      if (r.category !== 'primary_lane' && r.category !== 'country_lane') continue;
      let accum = 0;
      for (let i = 0; i < r.points.length - 1; i++) {
        const [x1, z1] = r.points[i];
        const [x2, z2] = r.points[i + 1];
        const seg = Math.hypot(x2 - x1, z2 - z1);
        accum += seg;
        if (accum >= 48) {
          accum = 0;
          if (Math.abs(x1) > 280 || Math.abs(z1) > 280) continue;
          const nx = -(z2 - z1) / (seg || 1);
          const nz = (x2 - x1) / (seg || 1);
          const px = x1 + nx * (r.width * 0.5 + 1.1);
          const pz = z1 + nz * (r.width * 0.5 + 1.1);
          const py = terrain.getHeightAt(px, pz);

          const pole = new THREE.Mesh(poleGeom, poleMat);
          pole.position.set(px, py + 3.7, pz);
          pole.castShadow = true;

          const crossBar = new THREE.Mesh(barGeom, poleMat);
          crossBar.position.y = 3.5;
          pole.add(crossBar);

          this.group.add(pole);
        }
      }
    }
  }

  private createRoadMaterial(
    centerHex: string,
    edgeHex: string,
    roughness: number
  ): THREE.MeshStandardMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, edgeHex);
    grad.addColorStop(0.14, centerHex);
    grad.addColorStop(0.48, '#6c6e72'); // Subtle rural single-track crown
    grad.addColorStop(0.86, centerHex);
    grad.addColorStop(1, edgeHex);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Subtle aggregate speckle
    let seed = 707;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    ctx.fillStyle = 'rgba(30, 30, 30, 0.14)';
    for (let i = 0; i < 900; i++) {
      ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;

    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }
}
