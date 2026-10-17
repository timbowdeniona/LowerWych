# Data & Media Attribution — Lower Wych 3D Walkthrough (`SY14 7JX`)

All elevation, vector, land-cover, and photographic reference assets used in this project are sourced exclusively from open and permissively licensed datasets. No proprietary satellite, aerial, or Street View tiles were scraped or used.

---

## 1. Geocoding & Coordinate Reference
- **Source**: [Postcodes.io](https://postcodes.io/) (`https://api.postcodes.io/postcodes/SY14%207JX`), powered by Ordnance Survey OpenData (Code-Point Open) and ONS Postcode Directory (ONSPD).
- **Licence**: Open Government Licence v3.0 (OGL v3.0) — Contains OS data © Crown copyright and database right; contains Royal Mail data © Royal Mail copyright and database right; contains National Statistics data © Crown copyright and database right.

---

## 2. Terrain Elevation (DTM) & Building Roof Surface (DSM)
- **Primary Terrain Source**: **Environment Agency National LIDAR Programme — 1 m Composite Digital Terrain Model (DTM)** (`13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m`), retrieved via the Defra Data Services Platform Web Coverage Service (`https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs`) for OS National Grid square `SJ4844` / `SJ4944` (`BBOX: E 348472–349072, N 344253–344853`).
- **Primary Building Footprint & Height Source**: **Environment Agency National LIDAR Programme — 1 m Composite Last Return DSM** (`9ba4d5ac-d596-445a-9056-dae3ddec0178__Lidar_Composite_Elevation_LZ_DSM_1m`) and **1 m Composite First Return DSM** (`df4e3ec3-315e-48aa-aaaf-b5ae74d7b2bb__Lidar_Composite_Elevation_FZ_DSM_1m`). Solid roof structures (`LZ_DSM − DTM >= 2.2 m` and `|FZ_DSM − LZ_DSM| <= 0.4 m`) were extracted at 1 m resolution to obtain exact building positions, footprints, orientations, eaves heights, and ridge heights across the `600 m × 600 m` bounding box.
- **Cross-Border / Fallback Supplement**: **Copernicus DEM GLO-30** via the [Open-Meteo Elevation API](https://open-meteo.com/en/docs/elevation-api), calibrated to the Environment Agency LIDAR vertical datum along Wych Brook.
- **Licences**:
  - Environment Agency LIDAR DTM & DSM data: [Open Government Licence v3.0 (OGL v3.0)](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) — © Environment Agency copyright and/or database right.
  - Copernicus DEM data: Copernicus WorldDEM-30 Open Licence (© DLR e.V. and Airbus Defence and Space GmbH, funded by the European Union).

---

## 3. Vector Features, Official Place Names & Property Names
- **OpenStreetMap**: Contributors via the [Overpass API](https://overpass-api.de/) ([Open Database Licence (ODbL) v1.0](https://opendatacommons.org/licenses/odbl/)).
  - Includes highways (`Lower Wych Road C146`, `Wigland Hall Lane`, `The Wychough`), public footpaths (`Wigland FP 5` / `The Bishop Bennet Way`, `Wychough FP 3`), heritage bridges (`Lower Wych Bridge`, Grade II listed, Wikidata `Q29507102`), waterways (`Wych Brook`, `Shothill Brook`), administrative boundaries (`OS_OpenData_BoundaryLine`), service driveways, and woodland polygons (`landuse=forest`).
- **Ordnance Survey & UK Government Open Address / EPC Register (OGL v3.0)**:
  - Official property and woodland names (`Valley Chapel`, `Vale Cottage`, `Brook Side`, `Coppice Cottage`, `Olivers Cottage`, `Hill House`, `Beech View`, `Hill Farm`, `The Haven`, `Lower Lanes Farm`, `Brook Farm Cottage`, `Wych Brook Cottage`, `Howberry Bungalow`, `The Graigs`, `Wellmeadow Wood`, `Scholar's Wood`, `Cae Du Wood`, `Stockton Dingle`) verified via Ordnance Survey 1:2,500 / 1:10,000 Landplan, National Library of Scotland OS 25-inch historic maps, and the MHCLG Open EPC Register (`find-energy-certificate.service.gov.uk`) for `SY14 7JX`.

---

## 4. Reference Photography (Architecture, Facades, Bridges, Materials & Verification)

Ground-level reference photographs from **Geograph Britain and Ireland** (grid squares `SJ4844` and `SJ4944`) and **Wikimedia Commons** were used to verify the layout of Lower Wych, calibrate procedural PBR textures (Cheshire red brick, white/cream lime render, Welsh grey slate roofs, weathered red/buff sandstone ashlar bridge parapets, and dark corrugated agricultural barns), and cross-check our 3D scene viewpoints:

| ID / File | Title & Description | Author | Source | Licence |
| :--- | :--- | :--- | :--- | :--- |
| `commons-184582331` | [Lower Wych Bridge 01](https://commons.wikimedia.org/wiki/File:Lower_Wych_Bridge_01.jpg) — Grade II listed sandstone bridge over Wych Brook (`Q29507102`) | Dave.Dunford | Wikimedia Commons | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `commons-184582330` | [Lower Wych Bridge 02](https://commons.wikimedia.org/wiki/File:Lower_Wych_Bridge_02.jpg) — View along The Wychough over Lower Wych Bridge | Dave.Dunford | Wikimedia Commons | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `commons-128746366` | [Entering Lower Wych - geograph.org.uk - 4421074](https://commons.wikimedia.org/wiki/File:Entering_Lower_Wych_-_geograph.org.uk_-_4421074.jpg) — Sandstone bridge parapet, Dutch barn, farm sheds, and red-brick farmhouse | Jeff Buck | Geograph Britain and Ireland / Wikimedia Commons | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `commons-107701011` | [Bridge over Wych Brook - geograph.org.uk - 2362167](https://commons.wikimedia.org/wiki/File:Bridge_over_Wych_Brook_-_geograph.org.uk_-_2362167.jpg) — Stream bridge in Lower Wych | Colin Pyle | Geograph Britain and Ireland / Wikimedia Commons | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `commons-128746306` | [The Bishop Bennet Way - geograph.org.uk - 4421061](https://commons.wikimedia.org/wiki/File:The_Bishop_Bennet_Way_-_geograph.org.uk_-_4421061.jpg) — Country lane, telegraph pole, hawthorn hedge, and steep wooded bank | Jeff Buck | Geograph Britain and Ireland / Wikimedia Commons | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `commons-128746780` | [England on the left, Wales on the right - geograph.org.uk - 4421100](https://commons.wikimedia.org/wiki/File:England_on_the_left,_Wales_on_the_right_-_geograph.org.uk_-_4421100.jpg) — Border view in Lower Wych | Jeff Buck | Geograph Britain and Ireland / Wikimedia Commons | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `commons-128746982` | [Wales on the left, England on the right - geograph.org.uk - 4421129](https://commons.wikimedia.org/wiki/File:Wales_on_the_left,_England_on_the_right_-_geograph.org.uk_-_4421129.jpg) — Border view in Lower Wych | Jeff Buck | Geograph Britain and Ireland / Wikimedia Commons | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `commons-128747183` | [The Bishop Bennet Way at Lower Wych - geograph.org.uk - 4421157](https://commons.wikimedia.org/wiki/File:The_Bishop_Bennet_Way_at_Lower_Wych_-_geograph.org.uk_-_4421157.jpg) — Trail through Lower Wych | Jeff Buck | Geograph Britain and Ireland / Wikimedia Commons | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `commons-128747138` | [The Bishop Bennet Way at Lower Wych - geograph.org.uk - 4421148](https://commons.wikimedia.org/wiki/File:The_Bishop_Bennet_Way_at_Lower_Wych_-_geograph.org.uk_-_4421148.jpg) — Footpath & lane in Lower Wych | Jeff Buck | Geograph Britain and Ireland / Wikimedia Commons | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `commons-128746959` | [Lower Wych, Wrexham County - geograph.org.uk - 4421126](https://commons.wikimedia.org/wiki/File:Lower_Wych,_Wrexham_County_-_geograph.org.uk_-_4421126.jpg) — Welsh side of Lower Wych | Jeff Buck | Geograph Britain and Ireland / Wikimedia Commons | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `commons-128745328` | [The Bishop Bennet Way at Hill Farm - geograph.org.uk - 4420938](https://commons.wikimedia.org/wiki/File:The_Bishop_Bennet_Way_at_Hill_Farm_-_geograph.org.uk_-_4420938.jpg) — Hill Farm in NW of bounding box | Jeff Buck | Geograph Britain and Ireland / Wikimedia Commons | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `commons-128745387` | [Entrance to Hill Farm - geograph.org.uk - 4420947](https://commons.wikimedia.org/wiki/File:Entrance_to_Hill_Farm_-_geograph.org.uk_-_4420947.jpg) — Driveway entrance to Hill Farm | Jeff Buck | Geograph Britain and Ireland / Wikimedia Commons | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `commons-128746251` | [Footpath at Lower Wych - geograph.org.uk - 4421055](https://commons.wikimedia.org/wiki/File:Footpath_at_Lower_Wych_-_geograph.org.uk_-_4421055.jpg) — Public footpath junction | Jeff Buck | Geograph Britain and Ireland / Wikimedia Commons | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `commons-128748110` | [Pond by the Bishop Bennet Way - geograph.org.uk - 4421277](https://commons.wikimedia.org/wiki/File:Pond_by_the_Bishop_Bennet_Way_-_geograph.org.uk_-_4421277.jpg) — Field pond along trail | Jeff Buck | Geograph Britain and Ireland / Wikimedia Commons | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `commons-144099758` | [Barn conversion, Wigland Farm - geograph.org.uk - 6142357](https://commons.wikimedia.org/wiki/File:Barn_conversion,_Wigland_Farm_-_geograph.org.uk_-_6142357.jpg) — Local Cheshire brick barn architecture | JThomas | Geograph Britain and Ireland / Wikimedia Commons | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `commons-144099769` | [House, Wigland Farm - geograph.org.uk - 6142359](https://commons.wikimedia.org/wiki/File:House,_Wigland_Farm_-_geograph.org.uk_-_6142359.jpg) — Local Cheshire farmhouse reference | JThomas | Geograph Britain and Ireland / Wikimedia Commons | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| `commons-9253283` | [Wych Brook Valley - geograph.org.uk - 130895](https://commons.wikimedia.org/wiki/File:Wych_Brook_Valley_-_geograph.org.uk_-_130895.jpg) — Steep-sided valley topography along Wych Brook | Mike Harris | Geograph Britain and Ireland / Wikimedia Commons | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
