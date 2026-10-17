import proj4 from 'proj4';

// Define British National Grid (EPSG:27700)
export const EPSG_27700 =
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs';

proj4.defs('EPSG:27700', EPSG_27700);

export const POSTCODE = 'SY14 7JX';

export const CENTRE_WGS84 = {
  lat: 52.995855,
  lon: -2.764698,
};

export const CENTRE_BNG = {
  easting: 348772,
  northing: 344553,
};

export const BOX_SIZE_M = 600;
export const HALF_BOX_M = BOX_SIZE_M / 2; // 300 m

export const BBOX_BNG = {
  minE: CENTRE_BNG.easting - HALF_BOX_M,  // 348472
  maxE: CENTRE_BNG.easting + HALF_BOX_M,  // 349072
  minN: CENTRE_BNG.northing - HALF_BOX_M, // 344253
  maxN: CENTRE_BNG.northing + HALF_BOX_M, // 344853
};

export const BBOX_WGS84 = {
  minLat: 52.993159,
  maxLat: 52.998551,
  minLon: -2.769176,
  maxLon: -2.760220,
};

/**
 * Convert WGS84 (lat, lon) to local scene coordinates (x, z) in metres
 * where (0, 0) is the centre of SY14 7JX,
 * +x = East (metres), -x = West (metres)
 * +z = South (metres), -z = North (metres) (standard Three.js right-handed Y-up convention)
 */
export function wgs84ToLocal(lat: number, lon: number): [number, number] {
  const [easting, northing] = proj4('EPSG:4326', 'EPSG:27700', [lon, lat]);
  const x = easting - CENTRE_BNG.easting;
  const z = -(northing - CENTRE_BNG.northing);
  return [Number(x.toFixed(2)), Number(z.toFixed(2))];
}

/**
 * Convert BNG (easting, northing) to local scene coordinates (x, z) in metres
 */
export function bngToLocal(easting: number, northing: number): [number, number] {
  const x = easting - CENTRE_BNG.easting;
  const z = -(northing - CENTRE_BNG.northing);
  return [Number(x.toFixed(2)), Number(z.toFixed(2))];
}

/**
 * Convert local scene coordinates (x, z) back to WGS84 (lat, lon)
 */
export function localToWgs84(x: number, z: number): { lat: number; lon: number } {
  const easting = CENTRE_BNG.easting + x;
  const northing = CENTRE_BNG.northing - z;
  const [lon, lat] = proj4('EPSG:27700', 'EPSG:4326', [easting, northing]);
  return { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
}
