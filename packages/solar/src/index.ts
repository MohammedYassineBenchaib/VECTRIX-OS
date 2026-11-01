/**
 * Solar site/roof visualization models (visual-only, no yield calculation).
 *
 * Stage 1: data structures and utilities for roof planes, obstructions, and
 * approximate sun position. None of this feeds into kWh/yield estimates.
 */

import type { Point } from "@vectrix/core";

export interface RoofPlane {
  id: string;
  /** Tilt angle in degrees from horizontal (0 = flat, 90 = vertical) */
  tiltDegrees: number;
  /** Azimuth in degrees from north, clockwise (0 = north, 90 = east) */
  azimuthDegrees: number;
  /** Roof outline polygon in plan coordinates (mm), reused from core geometry */
  outlinePolygon: Point[];
  /** Optional label for the roof plane */
  label?: string;
}

export interface Obstruction {
  id: string;
  /** Primitive type - simple shapes only as specified */
  shape: "box" | "cylinder";
  /** Position in plan coordinates (mm) */
  position: Point;
  /** Footprint dimensions (mm) */
  footprintWidthMm: number;
  footprintDepthMm: number;
  /** Height above ground/roof reference (mm) */
  heightMm: number;
  /** Optional label */
  label?: string;
}

export interface SiteLocation {
  /** Latitude in degrees */
  latitude: number;
  /** Longitude in degrees */
  longitude: number;
}

export interface SolarTime {
  /** Date for sun position calculation */
  date: Date;
  /** Hour (0-23) */
  hour: number;
  /** Minute (0-59) */
  minute: number;
}

export interface SunPosition {
  /** Solar altitude angle in degrees from horizon */
  altitudeDegrees: number;
  /** Solar azimuth angle in degrees from north, clockwise */
  azimuthDegrees: number;
  /** Whether sun is above horizon */
  aboveHorizon: boolean;
  /** Label indicating if this is illustrative/approximate */
  illustrative: boolean;
}

/**
 * Create a roof plane from tilt, azimuth, and polygon outline.
 * Uses existing geometry utilities conceptually - this constructs the model.
 */
export function createRoofPlane(
  id: string,
  tiltDegrees: number,
  azimuthDegrees: number,
  outlinePolygon: Point[],
  label?: string,
): RoofPlane {
  if (tiltDegrees < 0 || tiltDegrees > 90) {
    throw new Error("Roof tilt must be between 0 and 90 degrees");
  }
  if (azimuthDegrees < 0 || azimuthDegrees >= 360) {
    throw new Error("Roof azimuth must be between 0 and 359 degrees");
  }
  if (outlinePolygon.length < 3) {
    throw new Error("Roof outline polygon must have at least 3 points");
  }

  return {
    id,
    tiltDegrees,
    azimuthDegrees,
    outlinePolygon: outlinePolygon.map((p) => ({ x: p.x, y: p.y })),
    label,
  };
}

/**
 * Create a simple obstruction (box or cylinder).
 * User-entered, not inferred.
 */
export function createObstruction(
  id: string,
  shape: "box" | "cylinder",
  position: Point,
  footprintWidthMm: number,
  footprintDepthMm: number,
  heightMm: number,
  label?: string,
): Obstruction {
  if (heightMm <= 0) {
    throw new Error("Obstruction height must be positive");
  }
  if (footprintWidthMm <= 0 || footprintDepthMm <= 0) {
    throw new Error("Obstruction footprint dimensions must be positive");
  }

  return {
    id,
    shape,
    position: { x: position.x, y: position.y },
    footprintWidthMm,
    footprintDepthMm,
    heightMm,
    label,
  };
}

/**
 * Solar position calculation using NOAA (National Oceanic and Atmospheric Administration) algorithm.
 * 
 * Algorithm basis: NOAA Solar Position Calculator equations derived from Jean Meeus'
 * "Astronomical Algorithms" and the NOAA Solar Calculator implementation.
 * This is astronomically accurate for practical solar engineering purposes (errors typically < 0.01°),
 * suitable for geometric shading calculations. This replaces the Stage 1 illustrative approximation.
 */
export function calculateSunPosition(location: SiteLocation, time: SolarTime): SunPosition {
  const { latitude, longitude } = location;
  const date = time.date;
  
  // Julian day calculation
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  
  let a = Math.floor((14 - month) / 12);
  let y = year + 4800 - a;
  let m = month + 12 * a - 3;
  let julianDay = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  
  // Julian century
  const julianCentury = (julianDay + (time.hour - 12 + time.minute / 60) / 24 - 2451545.0) / 36525.0;
  
  // Geometric mean longitude of sun (degrees)
  const geomMeanLongSun = (280.46646 + julianCentury * (36000.76983 + julianCentury * 0.0003032)) % 360;
  
  // Geometric mean anomaly of sun (degrees)
  const geomMeanAnomSun = 357.52911 + julianCentury * (35999.05029 - 0.0001537 * julianCentury);
  
  // Eccentricity of Earth's orbit
  const eccentEarthOrbit = 0.016708634 - julianCentury * (0.000042037 + 0.0000001267 * julianCentury);
  
  // Sun equation of center
  const sunEqOfCtr = Math.sin(degToRad(geomMeanAnomSun)) * (1.914602 - julianCentury * (0.004817 + 0.000014 * julianCentury)) +
    Math.sin(degToRad(2 * geomMeanAnomSun)) * (0.019993 - 0.000101 * julianCentury) +
    Math.sin(degToRad(3 * geomMeanAnomSun)) * 0.000289;
  
  // Sun true longitude
  const sunTrueLong = geomMeanLongSun + sunEqOfCtr;
  
  // Sun true anomaly
  const sunTrueAnom = geomMeanAnomSun + sunEqOfCtr;
  
  // Sun radius vector (AUs)
  const sunRadVector = (1.000001018 * (1 - eccentEarthOrbit * eccentEarthOrbit)) / (1 + eccentEarthOrbit * Math.cos(degToRad(sunTrueAnom)));
  
  // Sun apparent longitude
  const sunAppLong = sunTrueLong - 0.00569 - 0.00478 * Math.sin(degToRad(125.04 - 1934.136 * julianCentury));
  
  // Mean obliquity of the ecliptic
  const meanObliqEcliptic = 23 + (26 + ((21.448 - julianCentury * (46.815 + julianCentury * (0.00059 - julianCentury * 0.001813)))) / 60) / 60;
  
  // Corrected obliquity
  const obliqCorr = meanObliqEcliptic + 0.00256 * Math.cos(degToRad(125.04 - 1934.136 * julianCentury));
  
  // Sun right ascension
  const sunRtAscen = radToDeg(Math.atan2(Math.cos(degToRad(obliqCorr)) * Math.sin(degToRad(sunAppLong)), Math.cos(degToRad(sunAppLong))));
  
  // Sun declination
  const sunDeclin = radToDeg(Math.asin(Math.sin(degToRad(obliqCorr)) * Math.sin(degToRad(sunAppLong))));
  
  // Equation of time (minutes)
  const varY = Math.tan(degToRad(obliqCorr / 2)) * Math.tan(degToRad(obliqCorr / 2));
  const eqOfTime = 4 * radToDeg(varY * Math.sin(degToRad(2 * geomMeanLongSun)) -
    2 * eccentEarthOrbit * Math.sin(degToRad(geomMeanAnomSun)) +
    4 * eccentEarthOrbit * varY * Math.sin(degToRad(geomMeanAnomSun)) * Math.cos(degToRad(2 * geomMeanLongSun)) -
    0.5 * varY * varY * Math.sin(degToRad(4 * geomMeanLongSun)) -
    1.25 * eccentEarthOrbit * eccentEarthOrbit * Math.sin(degToRad(2 * geomMeanAnomSun)));
  
  // True solar time
  const timeOffset = eqOfTime + 4 * longitude;
  let trueSolarTime = (time.hour * 60 + time.minute + timeOffset) % 1440;
  if (trueSolarTime < 0) trueSolarTime += 1440;
  
  // Hour angle
  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;
  if (hourAngle > 180) hourAngle -= 360;
  
  // Solar zenith angle
  const solarZenithAngle = radToDeg(
    Math.acos(
      Math.sin(degToRad(latitude)) * Math.sin(degToRad(sunDeclin)) +
        Math.cos(degToRad(latitude)) * Math.cos(degToRad(sunDeclin)) * Math.cos(degToRad(hourAngle)),
    ),
  );
  
  // Solar altitude
  const altitude = 90 - solarZenithAngle;
  
  // Solar azimuth
  let azimuth = radToDeg(
    Math.atan2(
      Math.sin(degToRad(hourAngle)),
      Math.cos(degToRad(hourAngle)) * Math.sin(degToRad(latitude)) - Math.tan(degToRad(sunDeclin)) * Math.cos(degToRad(latitude)),
    ),
  );
  azimuth = azimuth + 180;
  if (azimuth < 0) azimuth += 360;
  if (azimuth >= 360) azimuth -= 360;
  
  return {
    altitudeDegrees: altitude,
    azimuthDegrees: azimuth,
    aboveHorizon: altitude > -0.833, // Include civil twilight approximation
    illustrative: false,
  };
}

function degToRad(deg: number): number {
  return deg * (Math.PI / 180);
}

function radToDeg(rad: number): number {
  return rad * (180 / Math.PI);
}

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

/**
 * Calculate roof plane area from outline polygon.
 * Reuses polygon area concept from core geometry.
 */
export function calculateRoofPlaneArea(roofPlane: RoofPlane): number {
  // Simple shoelace formula for area
  const poly = roofPlane.outlinePolygon;
  if (poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const current = poly[i]!;
    const next = poly[(i + 1) % poly.length]!;
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2; // mm²
}

// ============ STAGE 2: GEOMETRY-BASED SHADING CALCULATIONS ============

export interface PanelRow {
  id: string;
  /** Position along roof or in array */
  position: Point;
  /** Row dimensions */
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  /** Spacing to next row (mm) */
  rowSpacingMm?: number;
}

export interface ShadingResult {
  roofPlaneId: string;
  /** Shading loss percentage (0-100) - not kWh/yield */
  shadingLossPercentage: number;
  /** Area shaded as fraction (0-1) */
  shadedAreaFraction: number;
  /** Timestamp */
  timestamp: Date;
}

export interface HourlyShadingResult {
  roofPlaneId: string;
  hour: number;
  month: number;
  shadingLossPercentage: number;
}

export interface MonthlyShadingResult {
  roofPlaneId: string;
  month: number;
  averageShadingLossPercentage: number;
  maxShadingLossPercentage: number;
  minShadingLossPercentage: number;
}

/**
 * Ray-triangle/box intersection for shadow casting
 * Projects rays from roof points toward sun to detect occlusion
 */
function rayIntersectsBox(
  rayOrigin: { x: number; y: number; z: number },
  rayDirection: { x: number; y: number; z: number },
  boxCenter: { x: number; y: number; z: number },
  boxHalfExtents: { x: number; y: number; z: number },
): boolean {
  // Simplified AABB ray intersection
  let tmin = -Infinity;
  let tmax = Infinity;

  // X axis
  if (Math.abs(rayDirection.x) < 1e-8) {
    if (rayOrigin.x < boxCenter.x - boxHalfExtents.x || rayOrigin.x > boxCenter.x + boxHalfExtents.x) {
      return false;
    }
  } else {
    let t1 = (boxCenter.x - boxHalfExtents.x - rayOrigin.x) / rayDirection.x;
    let t2 = (boxCenter.x + boxHalfExtents.x - rayOrigin.x) / rayDirection.x;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }

  // Y axis
  if (Math.abs(rayDirection.y) < 1e-8) {
    if (rayOrigin.y < boxCenter.y - boxHalfExtents.y || rayOrigin.y > boxCenter.y + boxHalfExtents.y) {
      return false;
    }
  } else {
    let t1 = (boxCenter.y - boxHalfExtents.y - rayOrigin.y) / rayDirection.y;
    let t2 = (boxCenter.y + boxHalfExtents.y - rayOrigin.y) / rayDirection.y;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }

  // Z axis
  if (Math.abs(rayDirection.z) < 1e-8) {
    if (rayOrigin.z < boxCenter.z - boxHalfExtents.z || rayOrigin.z > boxCenter.z + boxHalfExtents.z) {
      return false;
    }
  } else {
    let t1 = (boxCenter.z - boxHalfExtents.z - rayOrigin.z) / rayDirection.z;
    let t2 = (boxCenter.z + boxHalfExtents.z - rayOrigin.z) / rayDirection.z;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }

  return tmax > 0 && tmin < tmax;
}

/**
 * Calculate shadow fraction on roof plane from obstructions
 * Uses ray casting: sample points on roof, cast rays toward sun, check intersection with obstructions
 */
export function calculateShadowFraction(
  roofPlane: RoofPlane,
  obstructions: Obstruction[],
  sunPosition: SunPosition,
  sampleGridSize: number = 10,
): number {
  if (!sunPosition.aboveHorizon || sunPosition.altitudeDegrees < 0) {
    return 1.0; // Fully shaded or no direct sun
  }

  const poly = roofPlane.outlinePolygon;
  if (poly.length < 3) return 0;

  // Get bounding box of roof
  let minX = poly[0]!.x, maxX = poly[0]!.x;
  let minY = poly[0]!.y, maxY = poly[0]!.y;
  for (let i = 1; i < poly.length; i++) {
    if (poly[i]!.x < minX) minX = poly[i]!.x;
    if (poly[i]!.x > maxX) maxX = poly[i]!.x;
    if (poly[i]!.y < minY) minY = poly[i]!.y;
    if (poly[i]!.y > maxY) maxY = poly[i]!.y;
  }

  // Sun direction vector (unit direction toward sun)
  const altRad = degToRad(sunPosition.altitudeDegrees);
  const azRad = degToRad(sunPosition.azimuthDegrees);
  const sunDirX = Math.sin(azRad) * Math.cos(altRad);
  const sunDirY = Math.cos(azRad) * Math.cos(altRad);
  const sunDirZ = Math.sin(altRad);

  let shadedSamples = 0;
  let totalSamples = 0;

  // Sample grid over roof bounding box
  for (let i = 0; i < sampleGridSize; i++) {
    for (let j = 0; j < sampleGridSize; j++) {
      const x = minX + (maxX - minX) * (i + 0.5) / sampleGridSize;
      const y = minY + (maxY - minY) * (j + 0.5) / sampleGridSize;
      
      // Simple point-in-polygon test (ray casting)
      if (!pointInPolygon({ x, y }, poly)) continue;
      
      totalSamples++;
      const roofHeight = 3000; // Approximate roof height in mm (could be parameterized)
      
      // Ray origin on roof surface
      const rayOrigin = { x, y, z: roofHeight };
      
      // Check if ray intersects any obstruction
      let isShaded = false;
      for (const obs of obstructions) {
        const obsCenterX = obs.position.x;
        const obsCenterY = obs.position.y;
        const obsCenterZ = obs.heightMm / 2;
        const obsHalfX = obs.footprintWidthMm / 2;
        const obsHalfY = obs.footprintDepthMm / 2;
        const obsHalfZ = obs.heightMm / 2;
        
        if (rayIntersectsBox(
          rayOrigin,
          { x: sunDirX, y: sunDirY, z: sunDirZ },
          { x: obsCenterX, y: obsCenterY, z: obsCenterZ },
          { x: obsHalfX, y: obsHalfY, z: obsHalfZ },
        )) {
          isShaded = true;
          break;
        }
      }
      
      if (isShaded) shadedSamples++;
    }
  }

  if (totalSamples === 0) return 0;
  return shadedSamples / totalSamples;
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x, yi = polygon[i]!.y;
    const xj = polygon[j]!.x, yj = polygon[j]!.y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || 1e-10) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Calculate row-to-row self-shading between panel rows
 * Based on sun altitude and row spacing/geometry.
 * NOTE: The shading-fraction formula (1 - altitude/criticalAngle) is a simplified linear
 * approximation, not a rigorously derived geometric fraction like the ray-casting
 * calculation. It is presented with lower confidence than the ray-cast results.
 */
export function calculateRowToRowShading(
  rows: PanelRow[],
  sunPosition: SunPosition,
  roofTiltDegrees: number = 0,
): number {
  if (!sunPosition.aboveHorizon || rows.length < 2) return 0;
  if (!rows[0]!.rowSpacingMm) return 0;

  const altRad = degToRad(sunPosition.altitudeDegrees);
  const altDeg = sunPosition.altitudeDegrees;
  
  // Critical angle for row-to-row shading
  // tan(critical) = (rowHeight) / (rowSpacing * cos(tilt) + rowWidth * sin(tilt))
  const rowHeight = rows[0]!.heightMm;
  const rowWidth = rows[0]!.widthMm;
  const rowSpacing = rows[0]!.rowSpacingMm;
  const tiltRad = degToRad(roofTiltDegrees);
  
  const effectiveSpacing = rowSpacing * Math.cos(tiltRad) + rowWidth * Math.sin(tiltRad);
  const criticalAngle = Math.atan(rowHeight / effectiveSpacing) * (180 / Math.PI);
  
  // If sun altitude is below critical angle, self-shading occurs
  if (altDeg < criticalAngle) {
    // Shading fraction increases as sun angle decreases
    const shadingFraction = 1 - altDeg / criticalAngle;
    return Math.max(0, Math.min(1, shadingFraction));
  }
  
  return 0;
}

/**
 * Calculate shading loss percentage for a roof plane at a specific time
 * Returns percentage (0-100) - NOT kWh/yield
 */
export function calculateShadingLossPercentage(
  roofPlane: RoofPlane,
  obstructions: Obstruction[],
  sunPosition: SunPosition,
  rows?: PanelRow[],
): ShadingResult {
  const obstructionShadowFraction = calculateShadowFraction(roofPlane, obstructions, sunPosition);
  let selfShadowFraction = 0;
  
  if (rows && rows.length > 0) {
    selfShadowFraction = calculateRowToRowShading(rows, sunPosition, roofPlane.tiltDegrees);
  }
  
  // Combined shading (conservative - take maximum or additive with cap)
  const combinedFraction = Math.min(1, obstructionShadowFraction + selfShadowFraction * 0.5);
  const shadingLossPercentage = combinedFraction * 100;
  
  return {
    roofPlaneId: roofPlane.id,
    shadingLossPercentage: Math.round(shadingLossPercentage * 100) / 100,
    shadedAreaFraction: Math.round(combinedFraction * 10000) / 10000,
    timestamp: new Date(),
  };
}

/**
 * Calculate hourly shading loss percentages for a day
 */
export function calculateHourlyShading(
  roofPlane: RoofPlane,
  obstructions: Obstruction[],
  location: SiteLocation,
  date: Date,
  rows?: PanelRow[],
): HourlyShadingResult[] {
  const results: HourlyShadingResult[] = [];
  const month = date.getMonth() + 1;
  
  for (let hour = 0; hour < 24; hour++) {
    const sunPos = calculateSunPosition(location, { date, hour, minute: 0 });
    const shading = calculateShadingLossPercentage(roofPlane, obstructions, sunPos, rows);
    results.push({
      roofPlaneId: roofPlane.id,
      hour,
      month,
      shadingLossPercentage: shading.shadingLossPercentage,
    });
  }
  
  return results;
}

/**
 * Calculate monthly average shading loss percentages
 */
export function calculateMonthlyShading(
  roofPlane: RoofPlane,
  obstructions: Obstruction[],
  location: SiteLocation,
  year: number,
  rows?: PanelRow[],
): MonthlyShadingResult[] {
  const results: MonthlyShadingResult[] = [];
  
  for (let month = 1; month <= 12; month++) {
    // Sample a few days in the month (15th of month for simplicity)
    const date = new Date(Date.UTC(year, month - 1, 15));
    const hourlyResults = calculateHourlyShading(roofPlane, obstructions, location, date, rows);
    
    // Average only hours with sun above horizon
    const sunHours = hourlyResults.filter(h => {
      const sunPos = calculateSunPosition(location, { date, hour: h.hour, minute: 0 });
      return sunPos.aboveHorizon;
    });
    
    if (sunHours.length === 0) {
      results.push({
        roofPlaneId: roofPlane.id,
        month,
        averageShadingLossPercentage: 100,
        maxShadingLossPercentage: 100,
        minShadingLossPercentage: 100,
      });
    } else {
      const values = sunHours.map(h => h.shadingLossPercentage);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      
      results.push({
        roofPlaneId: roofPlane.id,
        month,
        averageShadingLossPercentage: Math.round(avg * 100) / 100,
        maxShadingLossPercentage: Math.round(max * 100) / 100,
        minShadingLossPercentage: Math.round(min * 100) / 100,
      });
    }
  }
  
  return results;
}
