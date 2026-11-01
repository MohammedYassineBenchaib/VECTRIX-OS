import { describe, expect, it, vi } from "vitest";
import { fetchPvgisYield, PvgisError } from "../src/index";

describe("PVGIS yield client", () => {
  it("constructs correct request from valid inputs", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        inputs: { meteo_data: { radiation_db: "PVGIS-SARAH3" } },
        outputs: {
          monthly: {
            fixed: [
              { month: 1, "E_d": 3.5, "E_m": 108.5, "H(i)_d": 4.27, "H(i)_m": 132.28, "SD_m": 15.12 },
            ],
          },
        },
      }),
    });
    global.fetch = mockFetch;

    const result = await fetchPvgisYield({
      location: { latitude: 40, longitude: 0 },
      system: { peakPowerKw: 1, systemLossPercent: 14, angle: 35, aspect: 0 },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("re.jrc.ec.europa.eu/api/PVcalc");
    expect(url).toContain("lat=40");
    expect(url).toContain("lon=0");
    expect(url).toContain("peakpower=1");
    expect(url).toContain("loss=14");
    expect(url).toContain("angle=35");
    expect(url).toContain("aspect=0");
    expect(result.source).toBe("PVGIS, European Commission Joint Research Centre");
  });

  it("parses realistic mocked response correctly", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        inputs: { meteo_data: { radiation_db: "PVGIS-SARAH3" } },
        outputs: {
          monthly: {
            fixed: [
              { month: 1, "E_d": 3.5, "E_m": 108.5, "H(i)_d": 4.27, "H(i)_m": 132.28, "SD_m": 15.12 },
              { month: 2, "E_d": 3.97, "E_m": 111.11, "H(i)_d": 4.9, "H(i)_m": 137.1, "SD_m": 13.53 },
            ],
          },
        },
      }),
    });

    const result = await fetchPvgisYield({
      location: { latitude: 40, longitude: 0 },
      system: { peakPowerKw: 1, systemLossPercent: 14 },
    });

    expect(result.monthly).toHaveLength(2);
    expect(result.monthly[0].month).toBe(1);
    expect(result.monthly[0].E_m).toBe(108.5);
    expect(result.annualEnergyKwh).toBeCloseTo(219.61);
    expect(result.annualIrradiationKwhM2).toBeCloseTo(269.38);
    expect(result.radiationDatabase).toBe("PVGIS-SARAH3");
  });

  it("handles malformed/error response from PVGIS", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: "Location out of range",
      }),
    });

    await expect(
      fetchPvgisYield({
        location: { latitude: 50, longitude: 0 },
        system: { peakPowerKw: 1, systemLossPercent: 14 },
      }),
    ).rejects.toThrow(PvgisError);
  });

  it("handles HTTP errors", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
    });

    await expect(
      fetchPvgisYield({
        location: { latitude: 40, longitude: 0 },
        system: { peakPowerKw: 1, systemLossPercent: 14 },
      }),
    ).rejects.toThrow(PvgisError);
  });

  it("parses hourly data from seriescalc when includeHourly is true", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("seriescalc")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            outputs: {
              hourly: [
                { time: "20200101:0010", "G(i)": 0, H_sun: 0, T2m: 5, WS10m: 2, P: 0 },
                { time: "20200101:1010", "G(i)": 500, H_sun: 30, T2m: 10, WS10m: 3, P: 400 },
              ],
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          inputs: { meteo_data: { radiation_db: "PVGIS-SARAH3" } },
          outputs: {
            monthly: {
              fixed: [
                { month: 1, "E_d": 1, "E_m": 30, "H(i)_d": 1, "H(i)_m": 30, "SD_m": 1 },
              ],
            },
          },
        }),
      });
    });

    const result = await fetchPvgisYield(
      { location: { latitude: 40, longitude: 0 }, system: { peakPowerKw: 1, systemLossPercent: 14 } },
      { includeHourly: true },
    );

    expect(result.hourly).toBeDefined();
    expect(Array.isArray(result.hourly)).toBe(true);
    expect(result.hourly?.length).toBe(2);
    expect(result.hourly?.[0].time).toBe("20200101:0010");
    expect(result.hourly?.[0].G_i).toBe(0);
    expect(result.hourly?.[1].time).toBe("20200101:1010");
    expect(result.hourly?.[1].G_i).toBe(500);
    expect(result.hourly?.[1].H_sun).toBe(30);
    expect(result.hourly?.[1].T2m).toBe(10);
    expect(result.hourly?.[1].WS10m).toBe(3);
    expect(result.hourly?.[1].P).toBe(400);
  });
});
