import { describe, expect, it } from "vitest";
import { computeTakeoff, takeoffToCsv } from "../src/takeoff";
import { makeProject, makeCircuit, makeEquipment, makeRoom, makeRoute } from "./fixtures";
import { fixtureId, getEquipmentDefinition } from "@vectrix/core";

describe("CSV formula injection mitigation", () => {
  const input = {
    project: makeProject(),
    circuits: [makeCircuit()],
    equipment: [],
    rooms: [makeRoom({ id: fixtureId("room", "living") })],
    routes: [makeRoute({ id: fixtureId("route", "r1") })],
    resolveDefinition: ((key: string) =>
      getEquipmentDefinition(key)) as typeof getEquipmentDefinition,
  };

  it("neutralises a project name starting with =", () => {
    const takeoff = computeTakeoff(input);
    const maliciousName = "=cmd";
    const csv = takeoffToCsv(takeoff, maliciousName);
    const firstLine = csv.split("\r\n")[0]!;
    const fieldPart = firstLine.replace("Project,", "");
    expect(fieldPart.startsWith("=")).toBe(false);
    expect(fieldPart.startsWith("'")).toBe(true);
  });

  it("neutralises values starting with +, -, @", () => {
    const takeoff = computeTakeoff(input);
    for (const trigger of ["+1+1", "-1-1", "@SUM(A1)"]) {
      const csv = takeoffToCsv(takeoff, trigger);
      const firstLine = csv.split("\r\n")[0]!;
      const fieldPart = firstLine.replace("Project,", "");
      expect(fieldPart.startsWith(trigger[0]!)).toBe(false);
      expect(fieldPart.startsWith("'")).toBe(true);
    }
  });
});
