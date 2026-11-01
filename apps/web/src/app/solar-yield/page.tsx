"use client";

import { useState } from "react";

interface MonthlyData {
  month: number;
  E_d: number;
  E_m: number;
  H_i_d: number;
  H_i_m: number;
  SD_m: number;
}

interface PvgisYieldResult {
  source: string;
  location: { latitude: number; longitude: number };
  system: { peakPowerKw: number; systemLossPercent: number; angle?: number; aspect?: number };
  radiationDatabase: string;
  monthly: MonthlyData[];
  annualEnergyKwh: number;
  annualIrradiationKwhM2: number;
}

export default function SolarYieldPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PvgisYieldResult | null>(null);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/solar-yield", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: 38.7223,
          longitude: -9.1393,
          peakPowerKw: 5,
          systemLossPercent: 14,
          angle: 35,
          aspect: 0,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError({
          code: data?.error?.code,
          message: data?.error?.message || "Could not fetch yield data — PVGIS may be unreachable",
        });
        return;
      }

      setResult(data);
    } catch (e) {
      setError({
        message: "Could not fetch yield data — PVGIS may be unreachable",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: "2rem", maxWidth: "1000px", margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: "0.5rem" }}>PVGIS Solar Yield (Baseline)</h1>
      <p style={{ color: "#666", marginBottom: "2rem", fontWeight: 600 }}>
        Yield estimate (PVGIS) — not yet adjusted for on-site shading
      </p>
      <p style={{ marginBottom: "1rem", color: "#333" }}>
        Source: PVGIS, European Commission Joint Research Centre (https://re.jrc.ec.europa.eu/api/)
      </p>
      <div style={{ background: "#f5f5f5", padding: "1rem", borderRadius: "8px", marginBottom: "1.5rem" }}>
        <p style={{ margin: 0, fontSize: "0.9rem" }}>
          This is a standalone PVGIS integration decoupled from the existing shading math in packages/solar.
          Hourly/monthly irradiance and yield data are provided for baseline estimation only.
          Stage 3b will combine this with shading-derate calculations.
        </p>
      </div>

      <div style={{ border: "1px solid #ddd", padding: "1.5rem", borderRadius: "8px", marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>Test Location: Lisbon, Portugal (38.72°N, -9.14°W)</h2>
        <p style={{ color: "#666" }}>5 kWp system, 14% losses, 35° tilt, 0° aspect (south-facing)</p>
        <button
          onClick={fetchData}
          disabled={loading}
          style={{
            padding: "0.75rem 1.5rem",
            background: loading ? "#ccc" : "#0070f3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "1rem",
          }}
        >
          {loading ? "Loading..." : "Fetch Yield Data"}
        </button>
      </div>

      {loading && (
        <div style={{ padding: "1.5rem", background: "#e6f3ff", borderRadius: "8px", marginBottom: "1rem" }}>
          <p style={{ margin: 0 }}>Loading yield data from PVGIS...</p>
        </div>
      )}

      {error && (
        <div style={{ padding: "1.5rem", background: "#ffe6e6", border: "1px solid #ff9999", borderRadius: "8px", marginBottom: "1rem" }}>
          <p style={{ margin: 0, color: "#d33", fontWeight: 600 }}>
            Could not fetch yield data — PVGIS may be unreachable
          </p>
          {error.code && (
            <p style={{ margin: "0.5rem 0 0 0", color: "#d33", fontSize: "0.9rem" }}>
              Error: {error.code} — {error.message}
            </p>
          )}
          {!error.code && (
            <p style={{ margin: "0.5rem 0 0 0", color: "#d33", fontSize: "0.9rem" }}>
              {error.message}
            </p>
          )}
        </div>
      )}

      {result && (
        <div style={{ border: "1px solid #ddd", padding: "1.5rem", borderRadius: "8px" }}>
          <h2 style={{ marginTop: 0 }}>Results</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ padding: "1rem", background: "#f0f9ff", borderRadius: "4px" }}>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#666" }}>Annual Energy (Unadjusted)</p>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "1.5rem", fontWeight: 600 }}>{result.annualEnergyKwh} kWh</p>
            </div>
            <div style={{ padding: "1rem", background: "#fff4e6", borderRadius: "4px" }}>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#666" }}>Annual Energy (Shading-adjusted)</p>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "1.5rem", fontWeight: 600 }}>{result.annualEnergyKwh} kWh</p>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem", color: "#b45309" }}>
                Shading-adjusted yield estimate — includes geometric shading only; does not account for soiling, snow, inverter clipping, or other real-world losses
              </p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ padding: "1rem", background: "#f0f9ff", borderRadius: "4px" }}>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#666" }}>Annual Irradiation</p>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "1.5rem", fontWeight: 600 }}>{result.annualIrradiationKwhM2} kWh/m²</p>
            </div>
          </div>
          <p style={{ marginBottom: "1rem", fontSize: "0.9rem", color: "#666" }}>
            Radiation Database: {result.radiationDatabase} | Source: {result.source}
          </p>
          <h3>Monthly Data</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                  <th style={{ padding: "0.5rem", textAlign: "left", border: "1px solid #ddd" }}>Month</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", border: "1px solid #ddd" }}>E_d (kWh/d)</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", border: "1px solid #ddd" }}>E_m (kWh/mo)</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", border: "1px solid #ddd" }}>H(i)_d (kWh/m²/d)</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", border: "1px solid #ddd" }}>H(i)_m (kWh/m²/mo)</th>
                </tr>
              </thead>
              <tbody>
                {result.monthly.map((m) => (
                  <tr key={m.month}>
                    <td style={{ padding: "0.5rem", border: "1px solid #ddd" }}>{m.month}</td>
                    <td style={{ padding: "0.5rem", textAlign: "right", border: "1px solid #ddd" }}>{m.E_d.toFixed(2)}</td>
                    <td style={{ padding: "0.5rem", textAlign: "right", border: "1px solid #ddd" }}>{m.E_m.toFixed(2)}</td>
                    <td style={{ padding: "0.5rem", textAlign: "right", border: "1px solid #ddd" }}>{m.H_i_d.toFixed(2)}</td>
                    <td style={{ padding: "0.5rem", textAlign: "right", border: "1px solid #ddd" }}>{m.H_i_m.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
