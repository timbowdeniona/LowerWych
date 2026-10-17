# Lower Wych 3D (`SY14 7JX`) — Interactive First-Person Walkthrough

An interactive, self-contained 3D first-person walkthrough of the border hamlet of **Lower Wych** (`SY14 7JX`, Cheshire West and Chester / Wrexham County Borough border, UK), built with **Vite**, **Three.js**, and **TypeScript** using exclusively open/licensed geospatial data.

---

## 1. Quick Start & Setup

### Prerequisites
- **Node.js** `>= 20` and **npm**

### Install & Run (Using Committed Pre-Processed Assets)
All pre-processed terrain, building/road/water/vegetation vectors, reference metadata, and synthesized land-cover textures are committed under [`public/data/`](file:///Users/timbo/Dev/LowerWych/public/data):

```bash
npm install
npm run dev
```

Open `http://localhost:5173/` in your browser.

### Production Build & Preview
```bash
npm run build
npm run preview
```

### Re-running the Offline Data Pipeline (Optional)
To re-fetch the raw Environment Agency 1 m LIDAR DTM, OpenStreetMap Overpass vectors, and Wikimedia/Geograph reference metadata and rebuild [`public/data/`](file:///Users/timbo/Dev/LowerWych/public/data):

```bash
npm run data:fetch-terrain   # Downloads EA 1m Composite LIDAR DTM GeoTIFF + Copernicus GLO-30 DEM
npm run data:fetch-osm       # Queries Overpass API for roads, bridges, streams, footpaths, woodlands
npm run data:fetch-refs      # Queries Wikimedia Commons & Geograph APIs for SJ4844 reference photos
npm run data:build           # Generates public/data/{terrain.json,features.json,landcover.png}
# Or run all four steps in sequence:
npm run data:all
```

Raw downloads are cached locally in `scripts/cache/` (git-ignored, `< 2 MB` total).

---

## 2. Coordinate System & Bounding Box

The scene is centred on postcode **`SY14 7JX`**, geocoded via the [Postcodes.io API](https://api.postcodes.io/postcodes/SY14%207JX):

| Parameter | Value |
| :--- | :--- |
| **Postcode** | `SY14 7JX` (Lower Wych, Wigland / Bronington border) |
| **WGS84 Centre (`EPSG:4326`)** | `52.995855° N, -2.764698° W` |
| **OS National Grid (`EPSG:27700`)** | `Eastings: 348772, Northings: 344553` (`1 km` square `SJ4844`) |
| **Bounding Box Size** | `600 m × 600 m` (`±300 m` from origin) |
| **BNG Bounding Box (`EPSG:27700`)** | `E: 348472 → 349072`, `N: 344253 → 344853` |
| **WGS84 Bounding Box (`EPSG:4326`)** | `Lat: 52.993159° → 52.998551° N`, `Lon: -2.769176° → -2.760220° W` |
| **Three.js Local Axes** | `+X = East`, `-X = West`, `-Z = North`, `+Z = South`, `+Y = Elevation (m AOD)` |

---

## 3. Data Provenance & Licensing

Full licence texts and individual image credits are recorded in [`ATTRIBUTION.md`](file:///Users/timbo/Dev/LowerWych/ATTRIBUTION.md). **No proprietary satellite, aerial, or Street View tiles (Google Maps/Earth/Street View, Bing, Apple) were scraped or used.**

1. **Terrain (`public/data/terrain.json`) & Building Surface Heights (`scripts/cache/lidar-buildings.json`)**:
   - **Terrain DTM**: **Environment Agency 1 m Composite LIDAR DTM** (`Lidar_Composite_Elevation_DTM_1m`, 2022–2025), fetched directly from the Defra Survey Data Platform WCS (`600 × 600` 1 m native pixels covering 100% of `E 348472..349072, N 344253..344853`, resampled to a `201 × 201` WebGL mesh grid spanning `43.61 m` to `86.08 m` AOD).
   - **Building Footprints & Roof Heights**: **Environment Agency 1 m Composite Last Return DSM** (`Lidar_Composite_Elevation_LZ_DSM_1m`) and **First Return DSM** (`Lidar_Composite_Elevation_FZ_DSM_1m`). Solid roof structures (`LZ_DSM − DTM >= 2.2 m` and `|FZ_DSM − LZ_DSM| <= 0.4 m`, filtering out deciduous tree canopy) were extracted in [`scripts/extract-lidar-buildings.ts`](file:///Users/timbo/Dev/LowerWych/scripts/extract-lidar-buildings.ts) and cross-referenced against Ordnance Survey 1:2,500 / 1:10,000 maps and 11 geotagged Geograph photographs.
   - **Licence**: Open Government Licence v3.0 (OGL v3.0).
2. **Vector Features & Official Names (`public/data/features.json`)**:
   - **Highways, Waterways & Woodlands**: **OpenStreetMap** via Overpass API (`Lower Wych Road C146`, `Wigland Hall Lane`, `The Wychough`, Grade II listed `Lower Wych Bridge` `Q29507102`, `Wych Brook`, `Shothill Brook`, `Wigland FP 5` / `The Bishop Bennet Way`, `Wychough FP 3`, `landuse=forest` woodlands, and farm service driveways) — Open Database Licence (ODbL 1.0).
   - **Official House, Farm & Woodland Names**: Verified via **Ordnance Survey 1:2,500 / 1:10,000 Landplan**, **National Library of Scotland OS 25-inch historic maps**, and the **UK Government Open EPC Register** (`SY14 7JX`):
     - **Central `SY14 7JX` & `Wigland Hall Lane` Bend**: `Valley Chapel` (converted Primitive Methodist Chapel at `E 348770, N 344554`), `Vale Cottage` (pale mint-green painted render cottage), `Brook Side` (2-storey Cheshire red-brick cottage), `Coppice Cottage`, `Olivers Cottage & Hill House`, `Wellmeadow Cottage`.
     - **Lower Wych Bridge, `The Wychough` & `Lower Wych Road` (Welsh / Cheshire Border)**: `Wych Brook Cottage`, `Lower Lanes Farm` (including the curved-roof dark corrugated Dutch barn, stone shippon, and cattle sheds), `The Haven` (2-storey red-brick house at the junction of `The Wychough` and `Lower Wych Road`), `Brook Farm Cottage`, `Howberry Bungalow`, `The Graigs`.
     - **Northern Ridge off `The Wychough`**: `Beech View` (with its double garage and mature oak tree at the driveway entrance) and `Hill Farm` (`Hill Farm House`, L-shaped red-brick courtyard barns, and agricultural sheds).
     - **Named Woodlands**: `Wellmeadow Wood`, `Stockton Dingle`, `Scholar's Wood`, and `Cae Du Wood`.
3. **Ground Land-Cover Texture (`public/data/landcover.png`)**:
   - Synthesized `1024 × 1024` land-cover drape raster generated in [`scripts/build-assets.ts`](file:///Users/timbo/Dev/LowerWych/scripts/build-assets.ts) from OSM landuse/water/highway vectors and EA 1 m LIDAR elevation/slope gradients.
4. **Architectural & Landscape Reference Imagery (`public/data/references.json`)**:
   - **Geograph Britain and Ireland** (`SJ4844`: `#4421074` *Entering Lower Wych*, `#4421126` *Lower Wych, Wrexham County*, `#4421157` & `#4421148` *The Bishop Bennet Way at Lower Wych*, `#4420947` *Entrance to Hill Farm*, `#4420938` *The Bishop Bennet Way at Hill Farm*, `#4421061` & `#4420949` *The Bishop Bennet Way*, `#4421100` & `#4421129` *Wych Brook*, `#4421277` *Pond by the Bishop Bennet Way* by Jeff Buck; `#2362167` by Colin Pyle) — **CC BY-SA 2.0**.
   - **Wikimedia Commons** (*Lower Wych Bridge 01* & *02* by Dave.Dunford, Grade II listed border bridge `Q29507102`) — **CC BY-SA 4.0**.

---

## 4. Controls & HUD Features

- **First-Person Movement**:
  - `WASD` or `Arrow Keys` to walk along lanes, bridges, and footpaths.
  - Hold `Shift` to sprint (`8.8 m/s` vs `4.2 m/s` walking speed).
  - Click the 3D scene to engage **Pointer Lock mouse-look** (`Esc` to release), or click-and-drag / use `Q` and `E` to rotate the camera without pointer lock.
  - **Mobile / Touch**: Dual virtual thumbsticks automatically appear on coarse-pointer (`pointer: coarse`) touch devices.
  - **Terrain & Bridge Following + Building Collision**: Eye height is maintained at `1.70 m` above the local EA 1 m LIDAR terrain surface, with smooth circle-vs-OBB sliding collision against building footprints and bridge parapets.
- **HUD & Interactive Controls**:
  - **Minimap (`Bottom-Left`)**: Top-down `600 m × 600 m` overview showing relief shading, `Wych Brook` & `Shothill Brook`, lanes, public footpaths, all 40 LIDAR-derived building footprints, player position, and viewing frustum cone. **Click anywhere on the minimap to teleport.**
  - **Compass & OS Grid Readout (`Top-Centre`)**: Live cardinal/intercardinal tape, bearing in degrees, 10-figure OS National Grid reference (`SJ 48xxx 44xxx`), and elevation (`m AOD`).
  - **Time-of-Day Slider (`Bottom-Right`)**: Scrubs solar elevation/azimuth (`05:00` to `21:00` BST), sky zenith/horizon shader colours, directional shadow angle, and atmospheric fog density/tint.
  - **Place Labels Toggle (`Key L`)**: Toggles 3D-projected HTML callouts for official OS/PAF house names, OSM streets, `Wych Brook`, `Lower Wych Bridge`, and named woodlands with 2D screen-space collision avoidance.
  - **Curated Viewpoint Presets (`Keys 1–5`)**: Instant teleport buttons matching the exact camera positions and bearings of 5 Geograph / Wikimedia Commons reference photographs (also accessible via URL query parameters `?vp=1`..`5` and `?tod=5..21`).

---

## 5. Visual Verification & Discrepancies Fixed

We verified the 3D scene across 5 reference viewpoints against Geograph (`SJ4844`), Wikimedia Commons, Ordnance Survey 1:2,500 / 1:10,000 maps, and the Environment Agency 1 m First/Last Return LIDAR DSM, identifying and fixing the following discrepancies:

1. **Exact 1 m LIDAR DSM Building Footprints vs. Sparse OSM Coverage (`All Clusters`)**:
   - *Discrepancy found*: Because OpenStreetMap had zero closed-way building polygons in `SJ4844`, our initial prototype relied on 20 estimated building positions and placeholder names.
   - *Fix applied*: Downloaded the **Environment Agency 1 m First Return (`FZ_DSM`) and Last Return (`LZ_DSM`) LIDAR GeoTIFFs** via Defra WCS, computed the normalized DSM (`nDSM = LZ_DSM − DTM`) with canopy filtering (`|FZ_DSM − LZ_DSM| <= 0.4 m`), and replaced all buildings with the **40 exact real building footprints, orientations, eaves heights, and ridge heights**, paired with their official **Ordnance Survey / Royal Mail PAF names**.
2. **Lower Wych Bridge, `The Wychough` & `Lower Lanes Farm` Dutch Barn (`Viewpoints 1 & 2` — Geograph `#4421074` & `#4421126`)**:
   - *Discrepancy found*: In Geograph `#4421074` (*Entering Lower Wych*), the photographer stands at the SE end of `Lower Wych Bridge` (`x = -278.5, z = 132.5`) looking SE (`136°`) along `The Wychough`, with the barrel-vaulted dark corrugated Dutch barn (`cx = -262.5, cz = 164.0`) and farm sheds of `Lower Lanes Farm` on the right (SW), `Wych Brook Cottage` on the left (NE), and 2-storey red-brick `The Haven` (`cx = -223.0, cz = 175.0`) straight ahead at the road junction. In our first pass after LIDAR extraction, the NE corner of the Dutch barn slightly overlapped `The Wychough` carriageway.
   - *Fix applied*: Aligned `Lower Lanes Farm Dutch Barn` (`angle = 46°`, `cx = -262.5, cz = 164.0`) and its adjoining stone shippon parallel to the SW edge of `The Wychough` carriageway, and placed `Lower Wych Road Brick Barn` (`cx = -243.5, cz = 200.5`) on the west edge of `Lower Wych Road` looking north towards `The Haven` (matching Geograph `#4421126`).
3. **`SY14 7JX` Postcode Centre: `Valley Chapel`, `Vale Cottage` & `Brook Side` (`Viewpoint 3` — Geograph `#4421157`)**:
   - *Discrepancy found*: The building at the `SY14 7JX` centre (`cx = -1.6, cz = -0.7`) is the historic converted Primitive Methodist Chapel (`Valley Chapel`, labeled *"Meth. Chapel (Primitive)"* on the OS 25-inch map) with pointed Gothic arched windows, while the outer bend of `Wigland Hall Lane` features 2-storey pale mint-green rendered `Vale Cottage` (`cx = 18.0, cz = -29.5`) and 2-storey Cheshire red-brick `Brook Side` (`cx = 56.8, cz = -45.5`) with a low sandstone roadside wall.
   - *Fix applied*: Added pointed Gothic arch window heads and terracotta ridge cresting to `Valley Chapel`, added per-building `WallColorHex` tinting (`#dce8dc`) for `Vale Cottage` and its lower slate-roofed wing in [`src/world/Buildings.ts`](file:///Users/timbo/Dev/LowerWych/src/world/Buildings.ts), and aligned the low sandstone roadside wall along `Brook Side`.
4. **`Hill Farm` & `Beech View` Entrance Driveway (`Viewpoint 4` — Geograph `#4420947` & OS 1:10,000)**:
   - *Discrepancy found*: Comparing Geograph `#4420947` (*Entrance to Hill Farm*) with the 1 m LIDAR DSM and OS 1:10,000 map showed `Beech View` (`cx = -174.0, cz = -134.5`), a mature oak tree, and a brick double garage (`cx = -161.5, cz = -139.0`) on the right (south) of the entrance driveway off `The Wychough`, opposite a high farmyard wall and L-shaped red-brick courtyard barn (`cx = -149.5, cz = -159.5` & `cx = -136.5, cz = -167.0`) on the left, leading east to `Hill Farm House` (`cx = -87.6, cz = -134.0`).
   - *Fix applied*: Modelled all 7 `Hill Farm` and `Beech View` structures at their exact 1 m LIDAR DSM coordinates together with the northern entrance wall and mature oak tree.

---

## 6. Known Inaccuracies & Next Steps

- **Procedural vs. Photogrammetric Roof Geometry**: While building footprints, positions, orientations, eaves heights, and ridge heights are extracted directly from the 1 m Environment Agency LIDAR DSM, roofs are rendered using clean procedural gabled/barrel-vault meshes rather than individual photogrammetric chimney/dormer scans.
- **Seasonal Foliage & Audio**: Adding Web Audio ambient soundscapes (flowing water near `Wych Brook`, birdsong in `Wellmeadow Wood` and `Scholar's Wood`) and seasonal hedgerow/deciduous foliage palettes.
