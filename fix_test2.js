const fs = require('fs');
let c = fs.readFileSync('packages/solar/test/solar.test.ts','utf8');
const s = c.indexOf('it("Test Case 2:');
const e = c.indexOf('it("calculates shading loss');
const repl = "it(\"Test Case 2: Same obstruction north of roof in summer, minimal shading\", () => {\n    // ALL INPUTS SPECIFIED (corrected geometry):\n    // Roof: 10m×10m flat [(0,0),(10000,0),(10000,10000),(0,10000)], tilt 0°, azimuth 180° | Obstruction: (5000,-5000), 2000×2000×10000 north of roof\n    // Location: 40°N,0° | Date: Jun 21 2026 12:00 UTC\n    const roof = createRoofPlane(\"roof-1\", 0, 180, [{x:0,y:0},{x:10000,y:0},{x:10000,y:10000},{x:0,y:10000}]);\n    const obstruction = createObstruction(\"obs-1\", \"box\", {x:5000,y:-5000}, 2000, 2000, 10000);\n    const sunPos = calculateSunPosition({latitude:40, longitude:0}, {date:new Date(Date.UTC(2026,5,21)), hour:12, minute:0});\n    // MANUAL: altitude ~68.9°, shadow length ~4000mm projects south to y=0 (roof edge) -> ~0\n    const shadowFraction = calculateShadowFraction(roof, [obstruction], sunPos, 20);\n    expect(shadowFraction).toBeCloseTo(0, 2);\n  });\n\n";
c = c.slice(0,s) + repl + c.slice(e);
fs.writeFileSync('packages/solar/test/solar.test.ts', c);
console.log('done2');
