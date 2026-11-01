import { Solar3DView } from "@/components/solar";
import { createObstruction, createRoofPlane } from "@vectrix/solar";

export default function SolarDemoPage() {
  const roofPlaneSouth = createRoofPlane(
    "roof-1",
    30,
    180,
    [
      { x: 0, y: 0 },
      { x: 11000, y: 0 },
      { x: 11000, y: 8000 },
      { x: 0, y: 8000 },
    ],
    "South Roof"
  );

  const roofPlaneEast = createRoofPlane(
    "roof-2",
    45,
    90,
    [
      { x: 20000, y: 10000 },
      { x: 28000, y: 10000 },
      { x: 28000, y: 16000 },
      { x: 20000, y: 16000 },
    ],
    "East Roof"
  );

  const obstruction = createObstruction(
    "obs-1",
    "box",
    { x: 5000, y: 4000 },
    3000,
    3000,
    6000,
    "Nearby Tree"
  );

  return (
    <main style={{ padding: "2rem", height: "100vh" }}>
      <Solar3DView roofPlanes={[roofPlaneSouth, roofPlaneEast]} obstructions={[obstruction]} />
    </main>
  );
}
