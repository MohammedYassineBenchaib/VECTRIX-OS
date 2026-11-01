const fs = require('fs');
let c = fs.readFileSync('packages/solar/test/solar.test.ts','utf8');
const s = c.indexOf('it("Test Case 1:');
const e = c.indexOf('it("Test Case 2:');
const repl = "it(\"Test Case 1: Tall obstruction north of flat roof at solar noon on winter solstice (between roof and sun)\", () => {\n    // ALL INPUTS SPECIFIED:\n    // Location: 40°N, 0° longitude | Date: Dec 21 2026 12:00 UTC | Roof: 10m×10m flat [(0,0),(10000,0),(10000,10000),(0,10000)], tilt 0°, azimuth 180°\n    // Obstruction: box at (5000,-5000), footprintWidthMm 2000, footprintDepthMm 2000, heightMm 10000 (north of roof)\n    const roof = createRoofPlane(\"roof-1\", 0, 180, [{x:0,y:0},{x:10000,y:0},{x:10000,y:10000},{x:0,y:10000}]);\n    const obstruction = createObstruction(\"obs-1\", \"box\", {x:5000,y:-5000}, 2000, 2000, 10000);\n    const sunPos = calculateSunPosition({latitude:40, longitude:0}, {date:new Date(Date.UTC(2026,11,21)), hour:12, minute:0});\n    // MANUAL: shadow length = 10000/tan(25.13°)=21299mm projects south onto roof -> 0.2\n    const shadowFraction = calculateShadowFraction(roof, [obstruction], sunPos, 20);\n    expect(shadowFraction).toBeCloseTo(0.2, 2);\n  });\n\n";
c = c.slice(0,s) + repl + c.slice(e);
fs.writeFileSync('packages/solar/test/solar.test.ts', c);
console.log('done');
