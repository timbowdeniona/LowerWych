import fs from 'node:fs';
import path from 'node:path';
import { fromArrayBuffer } from 'geotiff';
import { BBOX_BNG, BOX_SIZE_M, bngToLocal, localToWgs84 } from './config.ts';
import type { TerrainData } from '../src/types.ts';

const CACHE_DIR = path.resolve(process.cwd(), 'scripts/cache');
const PUBLIC_DATA_DIR = path.resolve(process.cwd(), 'public/data');

// Grid resolution: 201 x 201 (3m spacing across 600m x 600m) for fast loading + smooth 60fps terrain,
// sampled directly from 1m EA LIDAR DTM/DSM where available and blended across the Welsh border with Copernicus DEM.
const GRID_SIZE = 201;

async function fetchEaLidarWcs(kind: 'dtm' | 'dsm'): Promise<{
  rasters: Float32Array | Int16Array | Uint16Array | Float64Array;
  width: number;
  height: number;
  bbox: number[];
  noDataValue: number | null;
} | null> {
  const cachedTif = path.join(CACHE_DIR, `ea-lidar-${kind}.tif`);
  if (fs.existsSync(cachedTif)) {
    const buf = fs.readFileSync(cachedTif);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const tiff = await fromArrayBuffer(ab);
    const image = await tiff.getImage();
    const rasters = await image.readRasters();
    const band = rasters[0] as Float32Array;
    console.log(`Loaded cached EA 1m LIDAR ${kind.toUpperCase()} GeoTIFF: ${image.getWidth()}x${image.getHeight()}`);
    return {
      rasters: band,
      width: image.getWidth(),
      height: image.getHeight(),
      bbox: image.getBoundingBox(),
      noDataValue: image.getGDALNoData(),
    };
  }

  const candidateBaseUrls =
    kind === 'dtm'
      ? ['https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs']
      : [
          'https://environment.data.gov.uk/spatialdata/lidar-composite-first-return-dsm-1m/wcs',
          'https://environment.data.gov.uk/spatialdata/lidar-composite-last-return-dsm-1m/wcs',
          'https://environment.data.gov.uk/spatialdata/lidar-composite-digital-surface-model-dsm-1m/wcs',
        ];

  for (const baseUrl of candidateBaseUrls) {
    try {
      console.log(`Checking Defra EA 1m LIDAR ${kind.toUpperCase()} WCS capabilities at ${baseUrl}...`);
      const capRes = await fetch(`${baseUrl}?service=WCS&version=2.0.1&request=GetCapabilities`, {
        headers: { 'User-Agent': 'LowerWych3DWalkthrough/1.0' },
      });
      if (!capRes.ok) {
        console.warn(`EA LIDAR ${kind.toUpperCase()} GetCapabilities returned ${capRes.status}`);
        continue;
      }
      const capXml = await capRes.text();
      const match =
        capXml.match(/<wcs:CoverageId>([^<]+)<\/wcs:CoverageId>/i) ||
        capXml.match(/<CoverageId>([^<]+)<\/CoverageId>/i);
      const coverageId = match ? match[1].trim() : null;
      if (!coverageId) {
        console.warn(`Could not parse CoverageId from EA LIDAR ${kind.toUpperCase()} capabilities XML`);
        continue;
      }
      console.log(`Found EA LIDAR ${kind.toUpperCase()} CoverageId: ${coverageId}`);

    // Try WCS 2.0.1 GetCoverage for our 600m x 600m BNG bounding box
    const { minE, maxE, minN, maxN } = BBOX_BNG;
    const wcsUrls = [
      `${baseUrl}?service=WCS&version=2.0.1&request=GetCoverage&coverageId=${encodeURIComponent(coverageId)}&subset=E(${minE},${maxE})&subset=N(${minN},${maxN})&format=image/tiff`,
      `${baseUrl}?service=WCS&version=2.0.1&request=GetCoverage&coverageId=${encodeURIComponent(coverageId)}&subset=X(${minE},${maxE})&subset=Y(${minN},${maxN})&format=image/tiff`,
      `${baseUrl}?service=WCS&version=1.0.0&request=GetCoverage&coverage=${encodeURIComponent(coverageId)}&CRS=EPSG:27700&BBOX=${minE},${minN},${maxE},${maxN}&WIDTH=600&HEIGHT=600&FORMAT=GeoTIFF`,
    ];

    for (const url of wcsUrls) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'LowerWych3DWalkthrough/1.0' } });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && (contentType.includes('tiff') || contentType.includes('octet-stream'))) {
          const buf = await res.arrayBuffer();
          fs.writeFileSync(path.join(CACHE_DIR, `ea-lidar-${kind}.tif`), Buffer.from(buf));
          const tiff = await fromArrayBuffer(buf);
          const image = await tiff.getImage();
          const rasters = await image.readRasters();
          const band = rasters[0] as Float32Array;
          const noData = image.getGDALNoData();
          const bbox = image.getBoundingBox();
          console.log(
            `Loaded EA 1m LIDAR ${kind.toUpperCase()} GeoTIFF: ${image.getWidth()}x${image.getHeight()}, bbox=${bbox.join(',')}, noData=${noData}`
          );
          return {
            rasters: band,
            width: image.getWidth(),
            height: image.getHeight(),
            bbox,
            noDataValue: noData,
          };
        }
      } catch (innerErr) {
        // try next URL variant
      }
      }
    } catch (err) {
      console.warn(`EA LIDAR ${kind.toUpperCase()} WCS fetch error:`, err);
    }
  }
  return null;
}

/**
 * Fetch Copernicus GLO-30 DEM elevations via Open-Meteo Elevation API across a regular sample grid
 * (Covers both England and Wales seamlessly at 30m native resolution)
 */
async function fetchCopernicusDemGrid(sampleN = 25): Promise<number[][]> {
  console.log(`Fetching Copernicus GLO-30 DEM sample grid (${sampleN}x${sampleN}) via Open-Meteo...`);
  const pts: { row: number; col: number; lat: number; lon: number }[] = [];
  for (let r = 0; r < sampleN; r++) {
    const z = -300 + (r / (sampleN - 1)) * 600;
    for (let c = 0; c < sampleN; c++) {
      const x = -300 + (c / (sampleN - 1)) * 600;
      const { lat, lon } = localToWgs84(x, z);
      pts.push({ row: r, col: c, lat, lon });
    }
  }

  const grid: number[][] = Array.from({ length: sampleN }, () => Array(sampleN).fill(45));
  const batchSize = 80;

  for (let i = 0; i < pts.length; i += batchSize) {
    const batch = pts.slice(i, i + batchSize);
    const lats = batch.map((p) => p.lat.toFixed(6)).join(',');
    const lons = batch.map((p) => p.lon.toFixed(6)).join(',');
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'LowerWych3DWalkthrough/1.0' } });
    if (!res.ok) {
      throw new Error(`Open-Meteo elevation API returned ${res.status}`);
    }
    const json = (await res.json()) as { elevation: number[] };
    batch.forEach((p, idx) => {
      const val = json.elevation?.[idx];
      if (typeof val === 'number' && !Number.isNaN(val)) {
        grid[p.row][p.col] = val;
      }
    });
  }
  return grid;
}

function bicubicSampleGrid(grid: number[][], u: number, v: number): number {
  const rows = grid.length;
  const cols = grid[0].length;
  const fy = Math.max(0, Math.min(rows - 1, v * (rows - 1)));
  const fx = Math.max(0, Math.min(cols - 1, u * (cols - 1)));
  const y0 = Math.floor(fy);
  const x0 = Math.floor(fx);
  const ty = fy - y0;
  const tx = fx - x0;

  const get = (r: number, c: number) =>
    grid[Math.max(0, Math.min(rows - 1, r))][Math.max(0, Math.min(cols - 1, c))];

  // Catmull-Rom spline helper
  const cubic = (p0: number, p1: number, p2: number, p3: number, t: number) => {
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      0.5 *
      (2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
    );
  };

  const colVals: number[] = [];
  for (let dy = -1; dy <= 2; dy++) {
    colVals.push(
      cubic(
        get(y0 + dy, x0 - 1),
        get(y0 + dy, x0),
        get(y0 + dy, x0 + 1),
        get(y0 + dy, x0 + 2),
        tx
      )
    );
  }
  return cubic(colVals[0], colVals[1], colVals[2], colVals[3], ty);
}

function sampleLidarAtBng(
  lidar: NonNullable<Awaited<ReturnType<typeof fetchEaLidarWcs>>>,
  easting: number,
  northing: number
): number | null {
  const [minX, minY, maxX, maxY] = lidar.bbox;
  if (easting < minX || easting > maxX || northing < minY || northing > maxY) return null;
  const u = (easting - minX) / (maxX - minX);
  // GeoTIFF row 0 is North (maxY)
  const v = (maxY - northing) / (maxY - minY);
  const col = Math.min(lidar.width - 1, Math.max(0, Math.floor(u * lidar.width)));
  const row = Math.min(lidar.height - 1, Math.max(0, Math.floor(v * lidar.height)));
  const val = lidar.rasters[row * lidar.width + col];
  if (
    val === undefined ||
    Number.isNaN(val) ||
    val < -100 ||
    val > 1000 ||
    (lidar.noDataValue !== null && Math.abs(val - lidar.noDataValue) < 1e-3)
  ) {
    return null;
  }
  return Number(val);
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });

  const [dtmLidar, dsmLidar, copernicusGrid] = await Promise.all([
    fetchEaLidarWcs('dtm'),
    fetchEaLidarWcs('dsm'),
    fetchCopernicusDemGrid(25),
  ]);

  const heights: number[] = new Array(GRID_SIZE * GRID_SIZE);
  const dsmHeights: number[] = new Array(GRID_SIZE * GRID_SIZE);

  // Measure mean offset between EA LIDAR DTM and Copernicus GLO-30 DEM where both are valid
  let offsetSum = 0;
  let offsetCount = 0;
  if (dtmLidar) {
    for (let r = 0; r < GRID_SIZE; r += 4) {
      const v = r / (GRID_SIZE - 1);
      const northing = BBOX_BNG.maxN - v * BOX_SIZE_M;
      for (let c = 0; c < GRID_SIZE; c += 4) {
        const u = c / (GRID_SIZE - 1);
        const easting = BBOX_BNG.minE + u * BOX_SIZE_M;
        const lidarVal = sampleLidarAtBng(dtmLidar, easting, northing);
        if (lidarVal !== null) {
          const demVal = bicubicSampleGrid(copernicusGrid, u, v);
          offsetSum += lidarVal - demVal;
          offsetCount++;
        }
      }
    }
  }
  const demOffset = offsetCount > 0 ? offsetSum / offsetCount : 0;
  console.log(`Calibrated DEM-to-LIDAR vertical datum offset: ${demOffset.toFixed(2)}m (${offsetCount} samples)`);

  let validLidarSamples = 0;
  let minElevation = Infinity;
  let maxElevation = -Infinity;

  for (let r = 0; r < GRID_SIZE; r++) {
    const v = r / (GRID_SIZE - 1); // 0 = North (-300m Z), 1 = South (+300m Z)
    const northing = BBOX_BNG.maxN - v * BOX_SIZE_M;
    for (let c = 0; c < GRID_SIZE; c++) {
      const u = c / (GRID_SIZE - 1); // 0 = West (-300m X), 1 = East (+300m X)
      const easting = BBOX_BNG.minE + u * BOX_SIZE_M;

      const lidarDtm = dtmLidar ? sampleLidarAtBng(dtmLidar, easting, northing) : null;
      const lidarDsm = dsmLidar ? sampleLidarAtBng(dsmLidar, easting, northing) : null;
      const fallbackDem = bicubicSampleGrid(copernicusGrid, u, v) + demOffset;

      let h = fallbackDem;
      if (lidarDtm !== null) {
        h = lidarDtm;
        validLidarSamples++;
      }

      const idx = r * GRID_SIZE + c;
      heights[idx] = Number(h.toFixed(2));
      dsmHeights[idx] = Number((lidarDsm !== null ? lidarDsm : h).toFixed(2));

      if (heights[idx] < minElevation) minElevation = heights[idx];
      if (heights[idx] > maxElevation) maxElevation = heights[idx];
    }
  }

  const lidarCoveragePct = ((validLidarSamples / (GRID_SIZE * GRID_SIZE)) * 100).toFixed(1);
  const sourceDesc =
    validLidarSamples > 0
      ? `Environment Agency 1m Composite LIDAR DTM/DSM (${lidarCoveragePct}% coverage) + Copernicus GLO-30 DEM cross-border fill`
      : `Copernicus GLO-30 DEM (bicubic 3m grid over Lower Wych valley)`;

  const terrainData: TerrainData = {
    width: BOX_SIZE_M,
    depth: BOX_SIZE_M,
    gridCols: GRID_SIZE,
    gridRows: GRID_SIZE,
    minElevation: Number(minElevation.toFixed(2)),
    maxElevation: Number(maxElevation.toFixed(2)),
    source: sourceDesc,
    licence: 'Open Government Licence v3.0 (EA LIDAR) / Copernicus DEM Open Licence',
    heights,
    dsmHeights,
  };

  const outFile = path.join(CACHE_DIR, 'terrain-raw.json');
  fs.writeFileSync(outFile, JSON.stringify(terrainData));
  console.log(
    `Saved terrain grid (${GRID_SIZE}x${GRID_SIZE}) to ${outFile}: min=${terrainData.minElevation}m, max=${terrainData.maxElevation}m (${sourceDesc})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
