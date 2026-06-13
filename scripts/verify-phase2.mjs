// Headless browser check for Phase 2: real drag-select, control groups,
// right-click march, screenshots. Software rendering — FPS not meaningful.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173/';
const SHOTS = '/tmp/panji-shots';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`[console.error] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Frame the player start zone.
await page.evaluate(() => {
  const { cameraRig } = window.__panji;
  cameraRig.target.x = 18;
  cameraRig.target.z = 18;
  cameraRig.targetDist = 22;
});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/p2-01-units.png` });

// Screen-space bounding box of player units, then a real drag-select.
const bbox = await page.evaluate(() => {
  const { sim, gameRenderer } = window.__panji;
  const cam = gameRenderer.camera;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  sim.pool.forEach((e) => {
    if (!e.alive || e.owner !== 0 || e.kind !== 'unit') return;
    const v = { x: e.x, y: sim.grid.heightAt(e.x, e.z), z: e.z };
    const p = new (Object.getPrototypeOf(cam.position).constructor)(v.x, v.y, v.z);
    p.project(cam);
    const sx = (p.x + 1) * 0.5 * innerWidth;
    const sy = (-p.y + 1) * 0.5 * innerHeight;
    x0 = Math.min(x0, sx); y0 = Math.min(y0, sy);
    x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
  });
  return { x0: x0 - 30, y0: y0 - 40, x1: x1 + 30, y1: y1 + 20 };
});
await page.mouse.move(bbox.x0, bbox.y0);
await page.mouse.down();
await page.mouse.move(bbox.x1, bbox.y1, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);

const selCount = await page.evaluate(() => window.__panji.input.selection.size);
console.log(`drag-selected: ${selCount} units (expect 20)`);

// Control group: ctrl+1 to set, click empty ground, recall with 1.
await page.keyboard.down('Control');
await page.keyboard.press('Digit1');
await page.keyboard.up('Control');
await page.mouse.click(60, 60); // empty corner -> deselect
await page.waitForTimeout(200);
const afterClear = await page.evaluate(() => window.__panji.input.selection.size);
await page.keyboard.press('Digit1');
await page.waitForTimeout(200);
const afterRecall = await page.evaluate(() => window.__panji.input.selection.size);
console.log(`after empty click: ${afterClear}, after group recall: ${afterRecall}`);

// Right-click march order to a visible point further into the map.
// Zoom out a touch first so the target is on screen.
await page.evaluate(() => {
  window.__panji.cameraRig.targetDist = 34;
});
await page.waitForTimeout(900);
const target = await page.evaluate(() => {
  const { gameRenderer, sim } = window.__panji;
  const cam = gameRenderer.camera;
  const P = Object.getPrototypeOf(cam.position).constructor;
  const p = new P(27, sim.grid.heightAt(27, 26), 26);
  p.project(cam);
  return { x: (p.x + 1) * 0.5 * innerWidth, y: (-p.y + 1) * 0.5 * innerHeight };
});
console.log(`right-click target on screen: ${Math.round(target.x)}, ${Math.round(target.y)}`);
await page.mouse.click(Math.round(target.x), Math.round(target.y), { button: 'right' });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${SHOTS}/p2-02-marching.png` });

const marchCheck = await page.evaluate(() => {
  const { sim } = window.__panji;
  let moving = 0;
  sim.pool.forEach((e) => {
    if (e.alive && e.owner === 0 && e.path) moving++;
  });
  return moving;
});
console.log(`units actively pathing after order: ${marchCheck}`);

// Let them walk, then a close-up of the column.
await page.waitForTimeout(8000);
await page.evaluate(() => {
  const { sim, cameraRig } = window.__panji;
  let cx = 0, cz = 0, n = 0;
  sim.pool.forEach((e) => {
    if (e.alive && e.owner === 0 && e.kind === 'unit') { cx += e.x; cz += e.z; n++; }
  });
  cameraRig.target.x = cx / n;
  cameraRig.target.z = cz / n;
  cameraRig.targetDist = 14;
});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/p2-03-closeup.png` });

const overlayOn = await page.keyboard.press('F3');
await page.waitForTimeout(1200);
const overlay = await page.textContent('#debug-overlay');
console.log('--- overlay ---');
console.log(overlay);
console.log(`Problems: ${problems.length}`);
for (const p of problems) console.log('  ' + p);

await browser.close();
const ok = selCount === 20 && afterRecall === 20 && marchCheck > 0 && problems.length === 0;
console.log(ok ? 'PHASE 2 VISUAL: OK' : 'PHASE 2 VISUAL: ISSUES');
process.exit(ok ? 0 : 1);
