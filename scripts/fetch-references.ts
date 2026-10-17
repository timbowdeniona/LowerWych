import fs from 'node:fs';
import path from 'node:path';
import { CENTRE_WGS84, wgs84ToLocal } from './config.ts';

const CACHE_DIR = path.resolve(process.cwd(), 'scripts/cache');
const IMG_CACHE_DIR = path.join(CACHE_DIR, 'ref-images');
const PUBLIC_DATA_DIR = path.resolve(process.cwd(), 'public/data');

export interface ReferenceItem {
  id: string;
  title: string;
  author: string;
  source: 'Wikimedia Commons' | 'Geograph Britain and Ireland' | 'OpenStreetMap';
  url: string;
  imageUrl?: string;
  licence: string;
  lat: number;
  lon: number;
  x: number;
  z: number;
  description: string;
}

async function fetchCommonsPages(url: string): Promise<ReferenceItem[]> {
  const items: ReferenceItem[] = [];
  const res = await fetch(url, {
    headers: { 'User-Agent': 'LowerWych3DWalkthrough/1.0 (Open Data Educational Project)' },
  });
  if (!res.ok) return items;
  const data = await res.json();
  const pages = data?.query?.pages || {};
  for (const page of Object.values(pages) as any[]) {
    const ii = page.imageinfo?.[0];
    const coord = page.coordinates?.[0];
    if (!ii) continue;
    const meta = ii.extmetadata || {};
    const title = (page.title || '').replace(/^File:/, '').replace(/\.\w+$/, '');
    const authorRaw = meta.Artist?.value || meta.Credit?.value || 'Geograph / Wikimedia Contributor';
    const author = authorRaw.replace(/<[^>]+>/g, '').trim();
    const licence = meta.LicenseShortName?.value || 'CC BY-SA 2.0';
    const descRaw = meta.ImageDescription?.value || title;
    const description = descRaw.replace(/<[^>]+>/g, '').trim();
    const lat = coord?.lat ?? CENTRE_WGS84.lat;
    const lon = coord?.lon ?? CENTRE_WGS84.lon;
    const [x, z] = wgs84ToLocal(lat, lon);
    items.push({
      id: `commons-${page.pageid}`,
      title,
      author,
      source: title.toLowerCase().includes('geograph') ? 'Geograph Britain and Ireland' : 'Wikimedia Commons',
      url: ii.descriptionurl || `https://commons.wikimedia.org/?curid=${page.pageid}`,
      imageUrl: ii.url,
      licence,
      lat,
      lon,
      x,
      z,
      description,
    });
  }
  return items;
}

async function main() {
  fs.mkdirSync(IMG_CACHE_DIR, { recursive: true });
  fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });

  const geoUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch&ggsprimary=all&ggsnamespace=6&ggsradius=1000&ggscoord=${CENTRE_WGS84.lat}|${CENTRE_WGS84.lon}&ggslimit=40&prop=imageinfo|coordinates&iiprop=url|extmetadata&format=json`;
  const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=filetype:bitmap+%22Lower+Wych%22&gsrnamespace=6&gsrlimit=30&prop=imageinfo|coordinates&iiprop=url|extmetadata&format=json`;

  const [geoItems, searchItems] = await Promise.all([
    fetchCommonsPages(geoUrl),
    fetchCommonsPages(searchUrl),
  ]);

  const byId = new Map<string, ReferenceItem>();
  for (const item of [...geoItems, ...searchItems]) {
    byId.set(item.id, item);
  }
  const refs = [...byId.values()].sort(
    (a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)
  );

  fs.writeFileSync(path.join(CACHE_DIR, 'references-raw.json'), JSON.stringify(refs, null, 2));
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'references.json'), JSON.stringify(refs, null, 2));
  console.log(`Saved ${refs.length} unique photo reference records to public/data/references.json`);

  // Download top 8 closest reference images to cache for visual inspection
  for (const ref of refs.slice(0, 8)) {
    if (!ref.imageUrl) continue;
    const dest = path.join(IMG_CACHE_DIR, `${ref.id}.jpg`);
    if (fs.existsSync(dest)) continue;
    try {
      const r = await fetch(ref.imageUrl, {
        headers: { 'User-Agent': 'LowerWych3DWalkthrough/1.0 (Open Data Educational Project)' },
      });
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        fs.writeFileSync(dest, buf);
        console.log(`Downloaded reference image ${dest} (${ref.title})`);
      }
    } catch (e) {
      console.warn(`Could not download ${ref.imageUrl}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
