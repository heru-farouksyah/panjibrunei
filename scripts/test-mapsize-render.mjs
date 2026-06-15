// Phase 13 — render-side verification for variable map size. Spawns its own
// Vite dev server (the sandbox reaps backgrounded shells, so we keep it as a
// child of this one foreground node process), loads small + large maps, and
// asserts the renderer sized the fog texture + meshes to the grid and threw no
// console errors (catches shader-divisor / texture-size mistakes).
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 5191;
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
let viteOut = '';
vite.stdout.on('data', (d) => { viteOut += d; });
vite.stderr.on('data', (d) => { viteOut += d; });

await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('vite start timeout:\n' + viteOut)), 25000);
  const iv = setInterval(() => { if (viteOut.includes('ready in')) { clearInterval(iv); clearTimeout(to); res(); } }, 200);
});

let fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) fail++; };

try {
  const b = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-gpu'] });
  for (const size of [72, 128]) {
    const p = await b.newPage({ viewport: { width: 1100, height: 680 } });
    const errors = [];
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(`http://localhost:${PORT}/?quickstart&size=${size}`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => window.__panji?.gameRenderer, { timeout: 15000 });
    await p.waitForTimeout(1500);
    const info = await p.evaluate(() => ({
      g: window.__panji.sim.grid.size,
      fog: window.__panji.gameRenderer.fogOfWar.gridSize,
      water: !!window.__panji.gameRenderer.scene.getObjectByName('water'),
      terrain: !!window.__panji.gameRenderer.scene.getObjectByName('terrain'),
    }));
    check(`size ${size}: grid + fog texture sized`, info.g === size && info.fog === size, `grid=${info.g} fogTex=${info.fog}`);
    check(`size ${size}: terrain + water built`, info.water && info.terrain);
    check(`size ${size}: no console errors (shaders compiled)`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await p.screenshot({ path: `/tmp/map-${size}.png` });
    await p.close();
  }
  await b.close();
} catch (e) {
  console.log('HARNESS ERROR:', e.message);
  fail++;
}
vite.kill('SIGKILL');
console.log(fail ? `\n${fail} CHECK(S) FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
