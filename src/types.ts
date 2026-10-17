export interface TerrainData {
  width: number;       // 600 m
  depth: number;       // 600 m
  gridCols: number;    // e.g. 601 (1m resolution) or 257
  gridRows: number;    // e.g. 601 (1m resolution) or 257
  minElevation: number;
  maxElevation: number;
  source: string;
  licence: string;
  heights: number[];   // Row-major (north-to-south, west-to-east) elevation in metres AOD
  dsmHeights?: number[]; // Optional DSM surface elevations for building/canopy validation
}

export type BuildingMaterialType = 'brick' | 'render' | 'stone' | 'timber' | 'farm_clad';
export type RoofMaterialType = 'slate' | 'clay_tile' | 'metal' | 'thatch';
export type RoofShapeType = 'gabled' | 'hipped' | 'flat' | 'pitched';

export interface BuildingFeature {
  id: string;
  name?: string;
  type: string;
  footprint: [number, number][]; // Local [x, z] coordinates in metres (CCW)
  center: [number, number];
  eavesHeight: number;
  ridgeHeight: number;
  levels: number;
  wallMaterial: BuildingMaterialType;
  roofMaterial: RoofMaterialType;
  roofShape: RoofShapeType;
  WallColorHex?: string;
  tags: Record<string, string>;
}

export type HighwayCategory = 'primary_lane' | 'country_lane' | 'track' | 'driveway' | 'footpath' | 'bridleway';

export interface RoadFeature {
  id: string;
  name?: string;
  ref?: string;
  highway: string;
  category: HighwayCategory;
  surface: string;
  width: number;
  bridge?: boolean;
  points: [number, number][]; // Local [x, z] polyline in metres
}

export interface LinearBarrierFeature {
  id: string;
  type: 'hedge' | 'wall' | 'fence' | 'tree_row';
  height: number;
  width: number;
  points: [number, number][];
}

export interface WaterFeature {
  id: string;
  name?: string;
  type: 'stream' | 'river' | ' ditch' | 'pond' | 'water';
  isPolygon: boolean;
  width: number;
  points: [number, number][];
}

export interface LanduseFeature {
  id: string;
  type: 'woodland' | 'farmland' | 'meadow' | 'residential' | 'farmyard' | 'garden' | 'scrub' | 'grass';
  name?: string;
  polygon: [number, number][];
}

export interface TreePoint {
  x: number;
  z: number;
  scale: number;
  species: 'oak' | 'ash' | 'alder' | 'hawthorn' | 'willow';
}

export interface PlaceLabel {
  id: string;
  name: string;
  subtitle?: string;
  category: 'hamlet' | 'street' | 'landmark' | 'water' | 'building' | 'border';
  x: number;
  z: number;
  elevationOffset?: number;
}

export interface ViewpointPreset {
  id: string;
  name: string;
  description: string;
  x: number;
  z: number;
  yawDeg: number; // 0 = North (-z), 90 = East (+x), 180 = South (+z), 270 = West (-x)
  pitchDeg: number;
  referenceSource?: string;
}

export interface WorldFeaturesData {
  centre: {
    postcode: string;
    lat: number;
    lon: number;
    easting: number;
    northing: number;
  };
  bbox: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    minE: number;
    maxE: number;
    minN: number;
    maxN: number;
  };
  buildings: BuildingFeature[];
  roads: RoadFeature[];
  barriers: LinearBarrierFeature[];
  water: WaterFeature[];
  landuse: LanduseFeature[];
  trees: TreePoint[];
  labels: PlaceLabel[];
  viewpoints: ViewpointPreset[];
}
