import fs from 'node:fs';
import path from 'node:path';
import { BBOX_WGS84 } from './config.ts';

const CACHE_DIR = path.resolve(process.cwd(), 'scripts/cache');
const OUTPUT_FILE = path.join(CACHE_DIR, 'osm-raw.json');

// Expand query bbox slightly (~80m buffer) so roads/streams/polygons clipping at the 600m edge are complete
const BUFFER_LAT = 0.0008;
const BUFFER_LON = 0.0012;

const s = (BBOX_WGS84.minLat - BUFFER_LAT).toFixed(6);
const w = (BBOX_WGS84.minLon - BUFFER_LON).toFixed(6);
const n = (BBOX_WGS84.maxLat + BUFFER_LAT).toFixed(6);
const e = (BBOX_WGS84.maxLon + BUFFER_LON).toFixed(6);

const OVERPASS_QUERY = `
[out:json][timeout:60];
(
  way(${s},${w},${n},${e});
  relation["type"="multipolygon"](${s},${w},${n},${e});
  node["name"](${s},${w},${n},${e});
  node["natural"](${s},${w},${n},${e});
  node["historic"](${s},${w},${n},${e});
  node["amenity"](${s},${w},${n},${e});
  node["barrier"](${s},${w},${n},${e});
  node["place"](${s},${w},${n},${e});
);
out body;
>;
out skel qt;
`.trim();

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function fetchOsmData() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  for (const endpoint of ENDPOINTS) {
    try {
      console.log(`Querying Overpass API at ${endpoint} for bbox (${s}, ${w}, ${n}, ${e})...`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json',
          'User-Agent': 'LowerWych3DWalkthrough/1.0 (Open Data Educational Project)',
        },
        body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
      });

      if (!res.ok) {
        console.warn(`Endpoint ${endpoint} returned HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      if (data && Array.isArray(data.elements)) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
        console.log(`Saved ${data.elements.length} OSM elements to ${OUTPUT_FILE}`);
        return;
      }
    } catch (err) {
      console.warn(`Failed querying ${endpoint}:`, err);
    }
  }

  throw new Error('All Overpass API endpoints failed.');
}

fetchOsmData().catch((err) => {
  console.error(err);
  process.exit(1);
});
