/**
 * PVGIS solar yield integration (server-side only)
 * 
 * This module provides a decoupled PVGIS client for obtaining irradiance and yield baselines.
 * It does NOT combine with shading-derate calculations - that's handled separately.
 * 
 * Data source: PVGIS, European Commission Joint Research Centre
 * API: https://re.jrc.ec.europa.eu/api/
 */

import { z } from "zod";

export interface PvgisLocation {
  latitude: number;
  longitude: number;
}

export interface PvgisSystemParams {
  peakPowerKw: number; // Nominal power in kWp
  systemLossPercent: number; // System losses in %
  angle?: number; // Slope angle in degrees (default ~35)
  aspect?: number; // Azimuth angle in degrees (0 = south, -90 = east, 90 = west)
  mountingType?: "fixed" | "tracking" | "building"; // Mounting type
}

export interface PvgisRequest {
  location: PvgisLocation;
  system: PvgisSystemParams;
  useHorizon?: boolean;
  startYear?: number;
  endYear?: number;
}

const pvgisRequestSchema = z.object({
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  system: z.object({
    peakPowerKw: z.number().positive().max(10000),
    systemLossPercent: z.number().min(0).max(100),
    angle: z.number().min(0).max(90).optional(),
    aspect: z.number().min(-180).max(180).optional(),
    mountingType: z.enum(["fixed", "tracking", "building"]).optional(),
  }),
  useHorizon: z.boolean().optional(),
  startYear: z.number().int().min(2005).max(2023).optional(),
  endYear: z.number().int().min(2005).max(2023).optional(),
});

export interface PvgisMonthlyData {
  month: number;
  E_d: number; // Average daily energy production (kWh/d)
  E_m: number; // Average monthly energy production (kWh/mo)
  H_i_d: number; // Average daily sum of global irradiation per square meter (kWh/m2/d)
  H_i_m: number; // Average monthly sum of global irradiation per square meter (kWh/m2/mo)
  SD_m: number; // Standard deviation of monthly energy production (kWh)
}

export interface PvgisHourlyData {
  time: string;
  G_i: number; // Global irradiance on inclined plane (W/m2)
  H_sun: number; // Sun height (degrees)
  T2m: number; // 2-m air temperature (°C)
  WS10m: number; // 10-m wind speed (m/s)
  P: number; // Power output (W) - may be included depending on endpoint
}

export interface PvgisYieldResult {
  source: "PVGIS, European Commission Joint Research Centre";
  location: PvgisLocation;
  system: PvgisSystemParams;
  radiationDatabase: string;
  monthly: PvgisMonthlyData[];
  hourly?: PvgisHourlyData[];
  annualEnergyKwh: number;
  annualIrradiationKwhM2: number;
}

const pvgisMonthlyRowSchema = z.object({
  month: z.number(),
  E_d: z.number(),
  E_m: z.number(),
  "H(i)_d": z.number(),
  "H(i)_m": z.number(),
  SD_m: z.number(),
});

const pvgisErrorSchema = z.object({
  message: z.string().optional(),
  error: z.string().optional(),
});

const pvgisResponseSchema = z.object({
  inputs: z.any().optional(),
  outputs: z.object({
    monthly: z.object({
      fixed: z.array(pvgisMonthlyRowSchema).optional(),
    }).optional(),
    hourly: z.array(z.object({
      time: z.string(),
      "G(i)": z.number(),
      H_sun: z.number(),
      T2m: z.number(),
      WS10m: z.number(),
      P: z.number().optional(),
    })).optional(),
  }).optional(),
  message: z.string().optional(),
});

export class PvgisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PvgisError";
  }
}

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60000;
const DEFAULT_RATE_LIMIT_MAX = 10;

// Simple in-memory rate limiting (single instance only)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): void {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + DEFAULT_RATE_LIMIT_WINDOW_MS });
    return;
  }
  entry.count++;
  if (entry.count > DEFAULT_RATE_LIMIT_MAX) {
    throw new PvgisError("Rate limit exceeded. Please try again later.");
  }
}

export async function fetchPvgisYield(
  request: PvgisRequest,
  options: {
    timeoutMs?: number;
    rateLimitKey?: string;
    includeHourly?: boolean;
  } = {},
): Promise<PvgisYieldResult> {
  // Validate request
  const validated = pvgisRequestSchema.parse(request);

  // Rate limiting
  if (options.rateLimitKey) {
    checkRateLimit(options.rateLimitKey);
  }

  const { location, system } = validated;
  const angle = system.angle ?? 35;
  const aspect = system.aspect ?? 0;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Use PVGIS PVcalc endpoint for monthly data (more stable)
  const params = new URLSearchParams({
    lat: location.latitude.toString(),
    lon: location.longitude.toString(),
    peakpower: system.peakPowerKw.toString(),
    loss: system.systemLossPercent.toString(),
    angle: angle.toString(),
    aspect: aspect.toString(),
    outputformat: "json",
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://re.jrc.ec.europa.eu/api/PVcalc?${params.toString()}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new PvgisError(`PVGIS API error: ${response.status} ${response.statusText}`);
    }

    const data: any = await response.json();

    // Check for PVGIS error responses
    const errorCheck = pvgisErrorSchema.safeParse(data);
    if (errorCheck.success && (errorCheck.data.message || errorCheck.data.error)) {
      throw new PvgisError(errorCheck.data.message || errorCheck.data.error || "PVGIS API error");
    }

    // Parse response - PVGIS PVcalc returns JSON with outputs.monthly.fixed
    const monthlyData: PvgisMonthlyData[] = [];
    let annualEnergyKwh = 0;
    let annualIrradiationKwhM2 = 0;
    let radiationDatabase = "PVGIS-SARAH3";

    if (data.outputs?.monthly?.fixed && Array.isArray(data.outputs.monthly.fixed)) {
      for (const row of data.outputs.monthly.fixed) {
        monthlyData.push({
          month: row.month,
          E_d: row["E_d"] || 0,
          E_m: row["E_m"] || 0,
          H_i_d: row["H(i)_d"] || 0,
          H_i_m: row["H(i)_m"] || 0,
          SD_m: row["SD_m"] || 0,
        });
        annualEnergyKwh += row["E_m"] || 0;
        annualIrradiationKwhM2 += row["H(i)_m"] || 0;
      }
    } else if (data.outputs?.monthly && Array.isArray(data.outputs.monthly)) {
      // Alternative format
      for (const row of data.outputs.monthly) {
        monthlyData.push({
          month: row.month,
          E_d: row.E_d || 0,
          E_m: row.E_m || 0,
          H_i_d: row.H_i_d || row["H(i)_d"] || 0,
          H_i_m: row.H_i_m || row["H(i)_m"] || 0,
          SD_m: row.SD_m || 0,
        });
        annualEnergyKwh += row.E_m || 0;
        annualIrradiationKwhM2 += (row.H_i_m || row["H(i)_m"] || 0);
      }
    }

    if (data.inputs?.meteo_data?.radiation_db) {
      radiationDatabase = data.inputs.meteo_data.radiation_db;
    }

    const result: PvgisYieldResult = {
      source: "PVGIS, European Commission Joint Research Centre",
      location: validated.location,
      system: validated.system,
      radiationDatabase,
      monthly: monthlyData,
      annualEnergyKwh: Math.round(annualEnergyKwh * 100) / 100,
      annualIrradiationKwhM2: Math.round(annualIrradiationKwhM2 * 100) / 100,
    };

    // Optionally fetch hourly data (separate call, more expensive)
    if (options.includeHourly) {
      try {
        const hourlyParams = new URLSearchParams({
          lat: location.latitude.toString(),
          lon: location.longitude.toString(),
          peakpower: system.peakPowerKw.toString(),
          loss: system.systemLossPercent.toString(),
          angle: angle.toString(),
          aspect: aspect.toString(),
          startyear: (validated.startYear || 2020).toString(),
          endyear: (validated.endYear || 2020).toString(),
          outputformat: "json",
        });
        const hourlyResponse = await fetch(`https://re.jrc.ec.europa.eu/api/seriescalc?${hourlyParams.toString()}`, {
          method: "GET",
          headers: { "Accept": "application/json" },
          signal: controller.signal,
        });
        if (hourlyResponse.ok) {
          const hourlyData: any = await hourlyResponse.json();
          if (hourlyData.outputs?.hourly && Array.isArray(hourlyData.outputs.hourly)) {
            result.hourly = hourlyData.outputs.hourly.slice(0, 8760).map((h: any) => ({
              time: h.time,
              G_i: h["G(i)"] || 0,
              H_sun: h.H_sun || 0,
              T2m: h.T2m || 0,
              WS10m: h.WS10m || 0,
              P: h.P || 0,
            }));
          }
        }
      } catch (e) {
        // Hourly data is optional, don't fail the whole request
        console.warn("Failed to fetch hourly PVGIS data:", e);
      }
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new PvgisError("PVGIS request timed out");
    }
    if (error instanceof PvgisError) {
      throw error;
    }
    throw new PvgisError(`Failed to fetch PVGIS data: ${error instanceof Error ? error.message : String(error)}`);
  }
}
