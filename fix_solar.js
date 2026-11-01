const fs = require('fs');
let c = fs.readFileSync('packages/solar-yield/src/index.ts','utf8');
c = c.replace("  H(i)_d: z.number(),\n  H(i)_m: z.number(),", "  \"H(i)_d\": z.number(),\n  \"H(i)_m\": z.number(),");
fs.writeFileSync('packages/solar-yield/src/index.ts', c);
console.log('ok');
