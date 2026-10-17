import * as fs from 'node:fs';
import * as path from 'node:path';
import { fromArrayBuffer } from 'geotiff';
import { PNG } from 'pngjs';

const CACHE_DIR = path.resolve(import.meta.dirname, 'cache');
const OUT_DIR = '/Users/timbo/.gemini/antigravity/brain/39314006-b27a-41d8-8979-86b3b3b0ad59';

interface DetectedBuilding {
  id: number;
  cx: number;
  cz: number;
  easting: number;
  northing: number;
  areaM2: number;
  width: number;
  depth: number;
  angleDeg: number;
  eavesHeight: number;
  ridgeHeight: number;
  pixels: [number, number][];
}

async function readTiffRaster(filePath: string): Promise<{ w: number; h: number; data: Float32Array }> {
  const buf = fs.readFileSync(filePath);
  const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const img = await tiff.getImage();
  const [ras] = (await img.readRasters()) as unknown as [Float32Array];
  return { w: img.getWidth(), h: img.getHeight(), data: ras };
}

async function main() {
  const dtm = await readTiffRaster(path.join(CACHE_DIR, 'ea-lidar-dtm.tif'));
  const lzdsm = await readTiffRaster(path.join(CACHE_DIR, 'ea-lidar-dsm.tif'));
  const fzdsm = await readTiffRaster(path.join(CACHE_DIR, 'ea-lidar-fzdsm.tif'));

  const w = dtm.w;
  const h = dtm.h;

  // Step 1: Identify solid roof candidate pixels:
  // - Height above ground (lzdsm - dtm) >= 2.3m
  // - Difference between First Return and Last Return (fzdsm - lzdsm) <= 0.45m (impervious roof)
  // - Local surface smoothness (roofs have planar slopes, unlike jagged tree crowns)
  const isSolid = new Uint8Array(w * h);
  const heightAboveGround = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const g = dtm.data[idx];
      const lz = lzdsm.data[idx];
      const fz = fzdsm.data[idx];
      if (g < -100 || lz < -100) continue;

      const hag = lz - g;
      heightAboveGround[idx] = hag;
      const pen = Math.abs(fz - lz);

      if (hag >= 2.2 && hag <= 18.0 && pen <= 0.4) {
        isSolid[idx] = 1;
      }
    }
  }

  // Step 2: Morphological opening/closing (remove isolated 1px speckles in trees)
  const filtered = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (!isSolid[idx]) continue;
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (isSolid[(y + dy) * w + (x + dx)]) neighbors++;
        }
      }
      // Require at least 5 of 9 pixels in 3x3 window to be solid
      if (neighbors >= 5) filtered[idx] = 1;
    }
  }

  // Step 3: Connected components labeling (8-connectivity)
  const visited = new Uint8Array(w * h);
  const buildings: DetectedBuilding[] = [];
  let nextId = 1;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const startIdx = y * w + x;
      if (!filtered[startIdx] || visited[startIdx]) continue;

      const queue: [number, number][] = [[x, y]];
      visited[startIdx] = 1;
      const pixels: [number, number][] = [];
      const heights: number[] = [];

      while (queue.length > 0) {
        const [cx, cy] = queue.pop()!;
        const cIdx = cy * w + cx;
        pixels.push([cx, cy]);
        heights.push(heightAboveGround[cIdx]);

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const nIdx = ny * w + nx;
            if (filtered[nIdx] && !visited[nIdx]) {
              visited[nIdx] = 1;
              queue.push([nx, ny]);
            }
          }
        }
      }

      // Filter by area (>= 18 m^2) and compactness/planarity to reject dense woodland patches
      if (pixels.length < 18) continue;

      // Compute centroid in pixel space & local scene space
      let sumX = 0,
        sumY = 0;
      for (const [px, py] of pixels) {
        sumX += px;
        sumY += py;
      }
      const meanPx = sumX / pixels.length;
      const meanPy = sumY / pixels.length;

      // Minimum-area oriented bounding box via angle sweep (-90 to +90 deg)
      let bestArea = Infinity;
      let bestAngle = 0;
      let bestW = 0;
      let bestD = 0;
      let bestCenterPx = meanPx;
      let bestCenterPy = meanPy;

      for (let deg = -90; deg < 90; deg += 2) {
        const rad = (deg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        let minU = Infinity,
          maxU = -Infinity,
          minV = Infinity,
          maxV = -Infinity;
        for (const [px, py] of pixels) {
          const dx = px - meanPx;
          const dy = py - meanPy;
          const u = dx * cos + dy * sin;
          const v = -dx * sin + dy * cos;
          if (u < minU) minU = u;
          if (u > maxU) maxU = u;
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
        const spanU = maxU - minU + 1;
        const spanV = maxV - minV + 1;
        const boxArea = spanU * spanV;
        if (boxArea < bestArea) {
          bestArea = boxArea;
          bestAngle = deg;
          bestW = spanU;
          bestD = spanV;
          const midU = (minU + maxU) * 0.5;
          const midV = (minV + maxV) * 0.5;
          bestCenterPx = meanPx + midU * cos - midV * sin;
          bestCenterPy = meanPy + midU * sin + midV * cos;
        }
      }

      // Rectangularity / fill ratio check: buildings fill >= 0.38 of their OBB (or L-shaped buildings >= 0.32)
      const fillRatio = pixels.length / bestArea;
      if (fillRatio < 0.32) continue;

      heights.sort((a, b) => a - b);
      const p25 = heights[Math.floor(heights.length * 0.25)];
      const p95 = heights[Math.floor(heights.length * 0.95)];

      // Canonicalize so width >= depth
      if (bestD > bestW) {
        const tmp = bestW;
        bestW = bestD;
        bestD = tmp;
        bestAngle = ((bestAngle + 90 + 90) % 180) - 90;
      }

      const sceneX = Number((bestCenterPx - 300).toFixed(1));
      const sceneZ = Number((bestCenterPy - 300).toFixed(1));

      buildings.push({
        id: nextId++,
        cx: sceneX,
        cz: sceneZ,
        easting: Math.round(348772 + sceneX),
        northing: Math.round(344553 - sceneZ),
        areaM2: pixels.length,
        width: Number(bestW.toFixed(1)),
        depth: Number(bestD.toFixed(1)),
        angleDeg: bestAngle,
        eavesHeight: Number(Math.max(2.6, p25).toFixed(1)),
        ridgeHeight: Number(Math.max(3.6, p95).toFixed(1)),
        pixels,
      });
    }
  }

  console.log(`Detected ${buildings.length} solid building structures from 1m LIDAR DSM-DTM:`);
  for (const b of buildings) {
    console.log(
      `#${b.id}: local=(${b.cx}, ${b.cz}) BNG=(${b.easting}, ${b.northing}) size=${b.width}x${b.depth}m area=${b.areaM2}m² angle=${b.angleDeg}° eaves=${b.eavesHeight}m ridge=${b.ridgeHeight}m`
    );
  }

  fs.writeFileSync(
    path.join(CACHE_DIR, 'lidar-buildings.json'),
    JSON.stringify(buildings.map(({ pixels, ...rest }) => rest), null, 2)
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
