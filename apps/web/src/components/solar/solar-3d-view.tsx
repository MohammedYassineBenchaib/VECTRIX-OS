"use client";

import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import type { Obstruction, RoofPlane, SiteLocation } from "@vectrix/solar";
import { calculateShadingLossPercentage, calculateSunPosition } from "@vectrix/solar";

interface Solar3DViewProps {
  roofPlanes: RoofPlane[];
  obstructions: Obstruction[];
  siteLocation?: SiteLocation;
  initialDate?: Date;
}

function getPolygonCentroid(polygon: { x: number; y: number }[]) {
  if (polygon.length === 0) return { x: 0, y: 0 };
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    sumX += polygon[i]!.x;
    sumY += polygon[i]!.y;
  }
  return { x: sumX / polygon.length, y: sumY / polygon.length };
}

function getPolygonBounds(polygon: { x: number; y: number }[]) {
  if (polygon.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, depth: 0 };
  let minX = polygon[0]!.x;
  let maxX = polygon[0]!.x;
  let minY = polygon[0]!.y;
  let maxY = polygon[0]!.y;
  for (let i = 1; i < polygon.length; i += 1) {
    const p = polygon[i]!;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const width = Math.max(1, maxX - minX);
  const depth = Math.max(1, maxY - minY);
  return { minX, maxX, minY, maxY, width, depth };
}

/**
 * 3D site/roof visualization - VISUAL ONLY.
 * Does NOT affect yield/kWh calculations. Sun position is illustrative.
 */
export function Solar3DView({
  roofPlanes,
  obstructions,
  siteLocation = { latitude: 38.7, longitude: -9.1 },
  initialDate = new Date(),
}: Solar3DViewProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [hour, setHour] = useState(12);

  const sunPos = useMemo(
    () => calculateSunPosition(siteLocation, { date: selectedDate, hour, minute: 0 }),
    [siteLocation, selectedDate, hour],
  );

  const shadingResults = useMemo(
    () =>
      roofPlanes.map((roof) => calculateShadingLossPercentage(roof, obstructions, sunPos)),
    [roofPlanes, obstructions, sunPos],
  );

  return (
    <div className="solar-3d-container">
      <div className="solar-3d-header">
        <div>
          <h3>3D Site/Roof Visualization</h3>
          <p className="solar-3d-disclaimer">
            <strong>Shading not yet factored into yield estimate</strong> — This view is visual only and does not affect
            any yield/kWh calculation.
          </p>
          <p className="solar-3d-illustrative">Sun position calculated using NOAA Solar Position Algorithm (accurate).</p>
          <div className="solar-shading-panel" style={{ marginTop: "0.5rem", padding: "0.5rem", background: "#f5f5f5", borderRadius: "4px" }}>
            <strong>Shading-derate estimate — not combined with a yield calculation (no irradiance data source configured).</strong>
            {shadingResults.map((result) => (
              <div key={result.roofPlaneId}>
                Roof {result.roofPlaneId}: {result.shadingLossPercentage}% shading loss
              </div>
            ))}
          </div>
        </div>
        <div className="solar-3d-controls">
          <label>
            Date:
            <input
              type="date"
              value={selectedDate.toISOString().split("T")[0]}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
            />
          </label>
          <label>
            Hour: {hour}:00
            <input type="range" min="0" max="23" value={hour} onChange={(e) => setHour(Number(e.target.value))} />
          </label>
          <div className="solar-sun-info">
            Sun: Alt {sunPos.altitudeDegrees.toFixed(1)}°, Az {sunPos.azimuthDegrees.toFixed(1)}°
            {sunPos.aboveHorizon ? " (above horizon)" : " (below horizon)"}
          </div>
        </div>
      </div>
      <div className="solar-3d-canvas">
        <Canvas camera={{ position: [50, 40, 50], fov: 60 }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 20, 10]} intensity={0.8} />
          <OrbitControls />
          <gridHelper args={[200, 20]} />
          
          {/* Roof planes */}
          {roofPlanes.map((roof) => {
            const centroid = getPolygonCentroid(roof.outlinePolygon);
            const bounds = getPolygonBounds(roof.outlinePolygon);
            // Scale from mm to meters in scene units
            const widthM = bounds.width / 1000;
            const depthM = bounds.depth / 1000;
            const posXM = centroid.x / 1000;
            const posZM = centroid.y / 1000; // map polygon y to scene z
            // Azimuth: 0° = north, 90° = east (clockwise). In Three.js Y rotation, apply -azimuth in radians
            // to align with compass convention consistent with sun position.
            const azimuthRad = (-roof.azimuthDegrees * Math.PI) / 180;
            const tiltRad = (-roof.tiltDegrees * Math.PI) / 180;
            return (
              <group key={roof.id} position={[posXM, roof.tiltDegrees > 0 ? 2 : 0, posZM]} rotation={[tiltRad, azimuthRad, 0]}>
                <mesh>
                  <boxGeometry args={[widthM, 0.1, depthM]} />
                  <meshStandardMaterial color="#8b7355" />
                </mesh>
                {roof.label && (
                  <Text position={[0, 3, 0]} fontSize={0.5} color="black">
                    {roof.label} (Tilt {roof.tiltDegrees}° / Az {roof.azimuthDegrees}°)
                  </Text>
                )}
              </group>
            );
          })}
          
          {/* Obstructions */}
          {obstructions.map((obs) => (
            <mesh key={obs.id} position={[obs.position.x / 1000, obs.heightMm / 2000, obs.position.y / 1000]}>
              {obs.shape === "box" ? (
                <boxGeometry args={[obs.footprintWidthMm / 1000, obs.heightMm / 1000, obs.footprintDepthMm / 1000]} />
              ) : (
                <cylinderGeometry args={[obs.footprintWidthMm / 2000, obs.footprintWidthMm / 2000, obs.heightMm / 1000, 16]} />
              )}
              <meshStandardMaterial color="#4a4a4a" />
              {obs.label && (
                <Text position={[0, (obs.heightMm / 1000) / 2 + 0.5, 0]} fontSize={0.4} color="black">
                  {obs.label}
                </Text>
              )}
            </mesh>
          ))}
          
          {/* Sun indicator (illustrative) */}
          {sunPos.aboveHorizon && (
            <group position={[Math.sin((sunPos.azimuthDegrees * Math.PI) / 180) * 30, sunPos.altitudeDegrees / 3, Math.cos((sunPos.azimuthDegrees * Math.PI) / 180) * 30]}>
              <mesh>
                <sphereGeometry args={[0.5, 16, 16]} />
                <meshStandardMaterial color="#ffd700" emissive="#ffd700" emissiveIntensity={0.5} />
              </mesh>
              <Text position={[0, 1, 0]} fontSize={0.4} color="#b8860b">
                Sun position: illustrative
              </Text>
            </group>
          )}
        </Canvas>
      </div>
    </div>
  );
}
