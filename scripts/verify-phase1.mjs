// Headless smoke test for Phase 1: loads the built game, captures console
// errors, measures render FPS and sim tick rate, and saves screenshots.
// Run: LD_LIBRARY_PATH=$HOME/.local/chrome-libs node scripts/verify-phase1.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173/';
const SHOTS = '/tmp/panji-shots';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') {
    problems.push(`[console.${m.type()}] ${m.text()}`);
  }
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// Render FPS over 2s (software rendering here — a GPU will be much faster).
const fps = await page.evaluate(
  () =>
    new Promise((res) => {
      let frames = 0;
      const start = performance.now();
      (function loop() {
        frames++;
        const el = performance.now() - start;
        if (el < 2000) requestAnimationFrame(loop);
        else res((frames / el) * 1000);
      })();
    })
);

// Debug overlay (F3) — also exercises the raycast cursor readout.
await page.keyboard.press('F3');
await page.mouse.move(800, 450);
await page.waitForTimeout(1400);
const overlay = await page.textContent('#debug-overlay');

await page.screenshot({ path: `${SHOTS}/01-start-zone.png` });

// Whole-map overview from the center, fully zoomed out.
await page.evaluate(() => {
  const { cameraRig } = window.__panji;
  cameraRig.target.x = 48;
  cameraRig.target.z = 48;
  cameraRig.targetDist = 60;
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/02-overview.png` });

// Close-up of a river ford (water shader + sand bar crossing).
await page.evaluate(() => {
  const { sim, cameraRig } = window.__panji;
  let ford = null;
  for (let y = 0; y < 96 && !ford; y++) {
    for (let x = 0; x < 96; x++) {
      if (sim.grid.typeAt(x, y) === 4) { ford = { x, y }; break; }
    }
  }
  cameraRig.target.x = ford ? ford.x : 48;
  cameraRig.target.z = ford ? ford.y : 48;
  cameraRig.targetDist = 17;
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/03-ford.png` });

// WASD pan still works after programmatic moves.
await page.keyboard.down('a');
await page.waitForTimeout(500);
await page.keyboard.up('a');
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/04-river-panned.png` });

const overlay2 = await page.textContent('#debug-overlay');

console.log('=== RESULTS ===');
console.log(`FPS (software render): ${fps.toFixed(1)}`);
console.log('--- overlay at start zone ---');
console.log(overlay);
console.log('--- overlay at river ---');
console.log(overlay2);
console.log(`Problems: ${problems.length}`);
for (const p of problems) console.log('  ' + p);

await browser.close();
process.exit(problems.some((p) => p.includes('pageerror') || p.includes('console.error')) ? 1 : 0);
