// Headless browser check for Phase 4: fog-of-war rendering, projectiles,
// health bars, battle visuals.
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
await page.waitForTimeout(2500);

// 1. zoomed-out: most of the map should be black fog
await page.evaluate(() => {
  const { cameraRig } = window.__panji;
  cameraRig.target.x = 48;
  cameraRig.target.z = 48;
  cameraRig.targetDist = 60;
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/p4-01-fog.png` });

// enemy entity far away must be invisible to the player
const hiddenOk = await page.evaluate(() => {
  const { sim } = window.__panji;
  const far = sim.spawnUnit('pahlawan_kampilan', 1, 60, 60);
  sim.fog.update(sim);
  return !sim.isVisibleToPlayer(0, far);
});
console.log(`distant enemy hidden by fog: ${hiddenOk}`);

// 2. stage a battle near the player base
const picketIds = await page.evaluate(() => {
  const { sim, cameraRig } = window.__panji;
  const s = sim.grid.startZones[0];
  const mine = [];
  const picket = [];
  for (let i = 0; i < 5; i++) mine.push(sim.spawnUnit('pahlawan_kampilan', 0, s.x - 2 + i, s.y + 6).id);
  for (let i = 0; i < 4; i++) mine.push(sim.spawnUnit('pemanah', 0, s.x - 2 + i, s.y + 7.2).id);
  for (let i = 0; i < 4; i++) picket.push(sim.spawnUnit('penikam_keris', 1, s.x - 1 + i, s.y + 12).id);
  sim.cmdAttackMove(mine, s.x + 1, s.y + 12, 0);
  cameraRig.target.x = s.x + 1;
  cameraRig.target.z = s.y + 9;
  cameraRig.targetDist = 18;
  return picket;
});
await page.waitForTimeout(6000);
await page.screenshot({ path: `${SHOTS}/p4-02-battle.png` });

// poll until the picket is dead (software rendering runs below real time)
let picketAlive = 4;
for (let i = 0; i < 30 && picketAlive > 0; i++) {
  await page.waitForTimeout(2000);
  picketAlive = await page.evaluate(
    (ids) => ids.filter((id) => window.__panji.sim.pool.get(id)).length,
    picketIds
  );
}
const battleResult = await page.evaluate(() => {
  const { sim } = window.__panji;
  let mine = 0;
  sim.pool.forEach((e) => {
    if (e.kind === 'unit' && e.owner === 0 && e.proto.tags.includes('military')) mine++;
  });
  return { mine };
});
console.log(`picket remaining: ${picketAlive} (expect 0), my military: ${battleResult.mine}`);
await page.screenshot({ path: `${SHOTS}/p4-03-after.png` });

console.log(`Problems: ${problems.length}`);
for (const p of problems) console.log('  ' + p);
await browser.close();

const ok = hiddenOk && picketAlive === 0 && battleResult.mine >= 5 && problems.length === 0;
console.log(ok ? 'PHASE 4 VISUAL: OK' : 'PHASE 4 VISUAL: ISSUES');
process.exit(ok ? 0 : 1);
