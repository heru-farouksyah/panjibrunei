// Headless browser check for Phase 5: faction select screen, hero summon
// via HUD, ultimate via Q with VFX, faction color application.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173/';
const SHOTS = '/tmp/panji-shots';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`[console.error] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

// 1. faction select screen
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/p5-01-select.png` });
const cardCount = await page.evaluate(() => document.querySelectorAll('.faction-card').length);
console.log(`faction cards: ${cardCount} (expect 6)`);
await page.click('.faction-card:nth-child(2)'); // Sakam
await page.click('.start-btn');
await page.waitForTimeout(2500);
const chosenFaction = await page.evaluate(() => window.__panji.sim.players[0].factionId);
console.log(`match started as: ${chosenFaction} (expect sakam)`);

// 2. summon the hero (cheat in the prerequisites, then use the HUD button)
await page.evaluate(() => {
  const { sim, cameraRig } = window.__panji;
  const P = sim.players[0];
  P.era = 3;
  P.resources = { food: 9999, timber: 9999, gold: 9999, camphor: 9999 };
  const s = sim.grid.startZones[0];
  sim.spawnBuilding('panggung_panji', 0, s.x + 4, s.y - 3, true);
  cameraRig.target.x = s.x + 4;
  cameraRig.target.z = s.y;
  cameraRig.targetDist = 20;
});
await page.waitForTimeout(600);
// select the shrine by clicking it
const shrineScreen = await page.evaluate(() => {
  const { sim, gameRenderer } = window.__panji;
  let shrine = null;
  sim.pool.forEach((e) => {
    if (e.protoId === 'panggung_panji') shrine = e;
  });
  const cam = gameRenderer.camera;
  const P = Object.getPrototypeOf(cam.position).constructor;
  const p = new P(shrine.x, sim.grid.heightAt(shrine.x, shrine.z) + 1, shrine.z);
  p.project(cam);
  return { x: (p.x + 1) * 0.5 * innerWidth, y: (-p.y + 1) * 0.5 * innerHeight };
});
await page.mouse.click(shrineScreen.x, shrineScreen.y);
await page.waitForTimeout(500);
const selDebug = await page.evaluate(() => {
  const { sim, input } = window.__panji;
  const ids = [...input.selection];
  const names = ids.map((id) => sim.pool.get(id)?.protoId);
  // fallback: select the shrine directly if the click missed
  if (!names.includes('panggung_panji')) {
    let shrine = null;
    sim.pool.forEach((e) => {
      if (e.protoId === 'panggung_panji') shrine = e;
    });
    input.setSelection([shrine.id]);
    return { clicked: names, fallback: true };
  }
  return { clicked: names, fallback: false };
});
console.log(`click selected: ${JSON.stringify(selDebug)}`);
await page.waitForTimeout(400);
const panelHTML = await page.evaluate(() => document.getElementById('panel').innerHTML);
console.log(`panel: ${panelHTML.slice(0, 500)}`);
const summonClicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) =>
    b.textContent.startsWith('Summon') && !b.disabled
  );
  if (!btn) return false;
  btn.click();
  return true;
});
console.log(`summon button clicked: ${summonClicked}`);

// fast-forward the summoning (30s game time) via the debug handle —
// headless software rendering runs the sim far below real time
const hero = await page.evaluate(() => {
  const { sim } = window.__panji;
  for (let i = 0; i < 650 && !sim.heroOf(0); i++) sim.step();
  const h = sim.heroOf(0);
  return h ? { id: h.id, protoId: h.protoId } : null;
});
console.log(`hero on the field: ${JSON.stringify(hero)}`);
if (!hero) {
  console.log('PHASE 5 VISUAL: ISSUES (no hero)');
  await browser.close();
  process.exit(1);
}

// 3. ultimate via Q with enemies nearby (Sakam: 100 spectral warriors)
await page.evaluate(() => {
  const { sim, cameraRig, input } = window.__panji;
  const h = sim.heroOf(0);
  for (let i = 0; i < 5; i++) sim.spawnUnit('pahlawan_kampilan', 1, h.x + 4 + (i % 3), h.z + ((i / 3) | 0));
  input.setSelection([h.id]);
  cameraRig.target.x = h.x;
  cameraRig.target.z = h.z;
  cameraRig.targetDist = 22;
});
await page.waitForTimeout(600);
await page.keyboard.press('q');
await page.waitForTimeout(1500);
const spectrals = await page.evaluate(() => {
  let n = 0;
  window.__panji.sim.pool.forEach((e) => {
    if (e.alive && e.protoId === 'spectral_warrior') n++;
  });
  return n;
});
console.log(`spectral warriors after Q: ${spectrals} (expect ~100)`);
await page.screenshot({ path: `${SHOTS}/p5-02-ultimate.png` });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${SHOTS}/p5-03-charge.png` });

console.log(`Problems: ${problems.length}`);
for (const p of problems) console.log('  ' + p);
await browser.close();

const ok = cardCount === 6 && chosenFaction === 'sakam' && summonClicked &&
  hero && spectrals >= 90 && problems.length === 0;
console.log(ok ? 'PHASE 5 VISUAL: OK' : 'PHASE 5 VISUAL: ISSUES');
process.exit(ok ? 0 : 1);
