const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
for (const rel of ['src/physics.js','src/solver.js','src/render.js','src/app.js']) {
  const p = path.join(root, rel);
  if (fs.existsSync(p)) vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
}
vm.runInThisContext(fs.readFileSync(path.join(root, 'tests/test.js'), 'utf8'), { filename: 'tests/test.js' });
if (globalThis.CauchyTests && typeof globalThis.CauchyTests.run === 'function') {
  const result = globalThis.CauchyTests.run({log: console.log});
  if (!result.ok) process.exit(1);
} else {
  console.error('CauchyTests.run missing');
  process.exit(1);
}
