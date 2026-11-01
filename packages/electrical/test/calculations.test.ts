import { describe, expect, it } from "vitest";
import { calculateVoltageDrop, conductorResistanceAtTemp } from "../src/voltage-drop";
import {
  DEFAULT_CONDITIONS,
  correctedAmpacity,
  deratingFactors,
  getAmpacityRow,
} from "../src/ampacity";
import { selectCable, UnsupportedInstallationError } from "../src/cable-selection";

describe("conductor resistance", () => {
  it("uses the IEC 60228 20 °C value for 2.5 mm²", () => {
    expect(getAmpacityRow(2.5)?.resistance20OhmPerKm).toBe(7.41);
  });

  it("corrects to the PVC operating temperature", () => {
    const r70 = conductorResistanceAtTemp(2.5, "PVC");
    expect(r70).toBeCloseTo(7.41 * (1 + 0.00393 * 50), 6);
    expect(r70).toBeGreaterThan(7.41);
  });

  it("rejects a section with no verified data", () => {
    expect(() => conductorResistanceAtTemp(0.75, "PVC")).toThrow(/No conductor resistance data/);
  });
});

describe("voltage drop — reference calculations", () => {
  it("single-phase 16 A over 20 m on 2.5 mm² (PF 1)", () => {
    const result = calculateVoltageDrop({
      phaseMode: "single_phase",
      currentA: 16,
      lengthMm: 20_000,
      sectionMm2: 2.5,
      powerFactor: 1,
      phaseVoltageV: 230,
      lineVoltageV: 400,
      insulation: "PVC",
    });
    // ΔU = 2 × 16 × 0.020 × 8.866 mΩ/m ≈ 5.67 V
    expect(result.volts).toBeCloseTo(5.67, 1);
    expect(result.percent).toBeCloseTo(2.47, 1);
    expect(result.formula).toContain("2 · I");
  });

  it("balanced three-phase 32 A over 30 m on 25 mm² (PF 0.95)", () => {
    const result = calculateVoltageDrop({
      phaseMode: "three_phase",
      currentA: 32,
      lengthMm: 30_000,
      sectionMm2: 25,
      powerFactor: 0.95,
      phaseVoltageV: 230,
      lineVoltageV: 400,
      insulation: "PVC",
    });
    expect(result.volts).toBeGreaterThan(1.3);
    expect(result.volts).toBeLessThan(1.6);
    expect(result.percent).toBeLessThan(0.5);
    expect(result.formula).toContain("√3");
  });

  it("scales linearly with length and current", () => {
    const base = {
      phaseMode: "single_phase" as const,
      lengthMm: 10_000,
      sectionMm2: 4,
      powerFactor: 1,
      phaseVoltageV: 230,
      lineVoltageV: 400,
      insulation: "PVC" as const,
    };
    const a = calculateVoltageDrop({ ...base, currentA: 10 });
    const b = calculateVoltageDrop({ ...base, currentA: 20 });
    expect(b.volts).toBeCloseTo(a.volts * 2, 6);
  });

  it("accounts for power factor through the reactance term", () => {
    const base = {
      phaseMode: "single_phase" as const,
      currentA: 20,
      lengthMm: 50_000,
      sectionMm2: 10,
      phaseVoltageV: 230,
      lineVoltageV: 400,
      insulation: "PVC" as const,
    };
    const unity = calculateVoltageDrop({ ...base, powerFactor: 1 });
    const lagging = calculateVoltageDrop({ ...base, powerFactor: 0.8 });
    expect(lagging.percent).toBeLessThan(unity.percent);
  });

  it("rejects a negative current", () => {
    expect(() =>
      calculateVoltageDrop({
        phaseMode: "single_phase",
        currentA: -1,
        lengthMm: 1000,
        sectionMm2: 2.5,
        powerFactor: 1,
        phaseVoltageV: 230,
        lineVoltageV: 400,
        insulation: "PVC",
      }),
    ).toThrow(/negative/);
  });
});

describe("ampacity and derating", () => {
  it("uses the reference ampacity at 30 °C, one circuit", () => {
    expect(correctedAmpacity(2.5, 2, DEFAULT_CONDITIONS)).toBeCloseTo(27, 6);
  });

  it("derates for ambient temperature", () => {
    expect(correctedAmpacity(2.5, 2, { ...DEFAULT_CONDITIONS, ambientTempC: 40 })).toBeCloseTo(
      23.49,
      2,
    );
  });

  it("derates for grouped circuits", () => {
    expect(correctedAmpacity(2.5, 2, { ...DEFAULT_CONDITIONS, groupedCircuits: 2 })).toBeCloseTo(
      21.6,
      6,
    );
  });

  it("combines thermal insulation, grouping and ambient factors", () => {
    const factors = deratingFactors({
      ambientTempC: 40,
      groupedCircuits: 2,
      thermalInsulationFactor: 0.75,
    });
    expect(factors.totalFactor).toBeCloseTo(0.87 * 0.8 * 0.75, 6);
  });

  it("returns null rather than inventing data for an unsupported section", () => {
    expect(correctedAmpacity(0.75, 2, DEFAULT_CONDITIONS)).toBeNull();
  });
});

describe("cable selection", () => {
  const base = {
    phaseMode: "single_phase" as const,
    lengthMm: 20_000,
    powerFactor: 1,
    maxVoltageDropPct: 5,
    conditions: DEFAULT_CONDITIONS,
    insulation: "PVC" as const,
    phaseVoltageV: 230,
    lineVoltageV: 400,
  };

  it("selects 2.5 mm² for a 16 A socket circuit over 20 m at a 4% limit", () => {
    const result = selectCable({
      ...base,
      designCurrentA: 16,
      breakerRatingA: 16,
      maxVoltageDropPct: 4,
    });
    expect(result.selectedSectionMm2).toBe(2.5);
    expect(result.finalAmpacityA).toBeCloseTo(27, 1);
    expect(result.voltageDrop?.percent).toBeLessThan(4);
  });

  it("moves up a section when voltage drop is the binding constraint", () => {
    const result = selectCable({
      ...base,
      designCurrentA: 32,
      breakerRatingA: 32,
      lengthMm: 30_000,
      maxVoltageDropPct: 4,
    });
    expect(result.selectedSectionMm2).toBe(6);
    const four = result.candidates.find((candidate) => candidate.sectionMm2 === 4);
    expect(four?.accepted).toBe(false);
    expect(four?.rejectedBecause).toMatch(/voltage drop/);
  });

  it("moves up a section when the breaker, not the load, binds", () => {
    const result = selectCable({
      ...base,
      designCurrentA: 10,
      breakerRatingA: 20,
      lengthMm: 5000,
    });
    expect(result.selectedSectionMm2).toBe(2.5);
    const oneFive = result.candidates.find((candidate) => candidate.sectionMm2 === 1.5);
    expect(oneFive?.ampacityOk).toBe(false);
    expect(oneFive?.accepted).toBe(false);
    expect(oneFive?.rejectedBecause).toMatch(/derated capacity/);
  });

  it("returns no selection when the length makes every supported section fail", () => {
    const result = selectCable({
      ...base,
      designCurrentA: 63,
      breakerRatingA: 63,
      lengthMm: 2_000_000,
      maxVoltageDropPct: 3,
    });
    expect(result.selectedSectionMm2).toBeNull();
    expect(result.reason).toMatch(/No supported section/);
  });

  it("refuses to size XLPE cable until verified data exists", () => {
    expect(() =>
      selectCable({
        ...base,
        designCurrentA: 16,
        breakerRatingA: 16,
        insulation: "XLPE",
      }),
    ).toThrow(UnsupportedInstallationError);
  });

  it("states its assumptions", () => {
    const result = selectCable({ ...base, designCurrentA: 16, breakerRatingA: 16 });
    expect(result.assumptions.join(" ")).toMatch(/fault-loop impedance/);
    expect(result.assumptions.join(" ")).toMatch(/reference-method-C/);
  });
});
