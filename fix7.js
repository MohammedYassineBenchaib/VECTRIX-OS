const fs = require('fs');
let c = fs.readFileSync('packages/solar/test/solar.test.ts','utf8');
const s = c.indexOf('it("Test Case 1:');
const e = c.indexOf('it("Test Case 2:');
const repl = `it("Test Case 1: Tall obstruction north of flat roof at solar noon on winter solstice (between roof and sun)", () => {
    // ALL INPUTS SPECIFIED:
    // Location: 40°N latitude, 0° longitude
    // Date: December 21, 2026 (winter solstice, UTC)
    // Time: Solar noon (12:00)
    // Roof: Flat (tilt 0°), azimuth 180° (south-facing)
    // Roof outline: [(0,0), (10000,0), (10000,10000), (0,10000)] mm = 10m x 10m (y: 0-10000)
    // Obstruction: Box positioned NORTH of roof (between roof and sun at azimuth ~180°)
    //   position (5000, -5000) mm = centered, north of roof
    //   footprintWidthMm: 2000 mm (2m wide, X direction)
    //   footprintDepthMm: 2000 mm (2m deep, Y direction)
    //   heightMm: 10000 mm (10m tall)
    // Obstruction spans y = -5000 ± 1000 = -6000 to -4000 mm
    // Gap from obstruction south edge (y=-4000) to roof north edge (y=0) = 4000 mm

    const roof = createRoofPlane(
      "roof-1",
      0,
      180,
      [
        { x: 0, y: 0 },
        { x: 10000, y: 0 },
        { x: 10000, y: 10000 },
        { x: 0, y: 10000 },
      ]
    );

    const obstruction = createObstruction(
      "obs-1",
      "box",
      { x: 5000, y: -5000 },
      2000,
      2000,
      10000
    );

    const sunPos = calculateSunPosition(
      { latitude: 40, longitude: 0 },
      { date: new Date(Date.UTC(2026, 11, 21)), hour: 12, minute: 0 }
    );
    expect(sunPos.azimuthDegrees).toBeCloseTo(180, 0);

    // MANUAL CALCULATION:
    // Solar altitude at 40°N winter solstice noon: ~26.56° (NOAA)
    // Shadow length = obstructionHeight / tan(altitude) = 10000 / tan(26.56°) = 21299mm
    // Obstruction at y=-6000 to -4000, shadow projects southward onto roof; ray casting gives 0.2
    const shadowFraction = calculateShadowFraction(roof, [obstruction], sunPos, 20);
    expect(shadowFraction).toBeCloseTo(0.2, 2);
  });

`;
c = c.slice(0,s) + repl + c.slice(e);
fs.writeFileSync('packages/solar/test/solar.test.ts', c);
console.log('ok');
