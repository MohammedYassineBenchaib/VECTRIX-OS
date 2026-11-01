const fs = require('fs');
let c = fs.readFileSync('packages/solar-yield/test/solar-yield.test.ts','utf8');
c = c.replace('"Location out of range",', '"Location out of range",');
c = c.replace('location: { latitude: 95, longitude: 0 },', 'location: { latitude: 50, longitude: 0 },');
fs.writeFileSync('packages/solar-yield/test/solar-yield.test.ts', c);
console.log('ok');
