"use client";

import type { Circuit } from "@vectrix/core";
import type { LoadSchedule } from "@vectrix/electrical";
import { formatNumber, formatVA } from "@/lib/format";

export function CircuitBusbar({
  circuits,
  schedule,
  activeCircuitId,
  totalDemandVA,
  onSelect,
}: {
  circuits: Circuit[];
  schedule: LoadSchedule;
  activeCircuitId: string | null;
  totalDemandVA: number;
  onSelect: (circuitId: string | null) => void;
}) {
  const loads = new Map(schedule.circuits.map((load) => [load.circuitId, load]));

  return (
    <div className="busbar" role="group" aria-label="Circuit directory">
      <button
        type="button"
        className="breaker"
        style={{ ["--circuit" as string]: "var(--line-strong)" }}
        data-active={activeCircuitId === null}
        aria-pressed={activeCircuitId === null}
        onClick={() => onSelect(null)}
      >
        <span className="b-led" />
        <span className="b-name">All circuits</span>
        <span className="b-meta">
          {circuits.length} way · {formatVA(totalDemandVA)}
        </span>
      </button>

      {circuits.map((circuit) => {
        const load = loads.get(circuit.id);
        return (
          <button
            key={circuit.id}
            type="button"
            className="breaker"
            style={{ ["--circuit" as string]: circuit.color }}
            data-active={activeCircuitId === circuit.id}
            data-dimmed={activeCircuitId !== null && activeCircuitId !== circuit.id}
            aria-pressed={activeCircuitId === circuit.id}
            onClick={() => onSelect(circuit.id)}
            title={`${circuit.name} — ${formatNumber(circuit.breakerRatingA)} A ${circuit.breakerCurve}${circuit.rcdSensitivityMa ? `, ${circuit.rcdSensitivityMa} mA RCD` : ""}`}
          >
            <span className="b-led" />
            <span className="b-name">{circuit.name}</span>
            <span className="b-meta">
              {formatNumber(circuit.breakerRatingA)} A · {formatNumber(load?.currentA ?? 0, 1)} A
            </span>
          </button>
        );
      })}
    </div>
  );
}
