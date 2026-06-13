// Visual check for the UI rework + new unit + construction VFX.
// Desktop and mobile viewports.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173/?quickstart';
const SHOTS = '/tmp/panji-shots';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-gpu'],
});

const problems = [];
async function newPage(w, h, touch) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    hasTouch: !!touch,
    isMobile: !!touch,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${w}x${h} console.error] ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${w}x${h} pageerror] ${e.message}`));
  return page;
}

const cheats = () => {
  const { sim } = window.__panji;
  sim.players[0].era = 3;
  sim.players[0].resources = { food: 9999, timber: 9999, gold: 9999, camphor: 9999 };
};

// ---------- DESKTOP ----------
{
  const page = await newPage(1280, 720, false);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.evaluate(cheats);

  // select villagers -> build command card
  const vilIds = await page.evaluate(() => {
    const { sim, input, cameraRig } = window.__panji;
    const v = [];
    sim.pool.forEach((e) => { if (e.owner === 0 && e.protoId === 'penduduk') v.push(e.id); });
    input.setSelection(v);
    const e = sim.pool.get(v[0]);
    cameraRig.target.x = e.x; cameraRig.target.z = e.z; cameraRig.targetDist = 22;
    return v;
  });
  await page.waitForTimeout(700);
  const tiles = await page.evaluate(() => document.querySelectorAll('.cmd-tile').length);
  const resVals = await page.evaluate(() =>
    [...document.querySelectorAll('#topbar .res-val')].map((e) => e.textContent));
  console.log(`[desktop] command tiles: ${tiles}, top bar values: ${resVals.join(' / ')}`);
  await page.screenshot({ path: `${SHOTS}/ui-01-desktop-hud.png` });

  // place a building to show scaffolding + construction
  await page.evaluate(() => {
    const { sim, hud, cameraRig } = window.__panji;
    const s = sim.grid.startZones[0];
    // find a buildable spot
    let spot = null;
    for (let r = 3; r < 12 && !spot; r++)
      for (let dz = -r; dz <= r && !spot; dz++)
        for (let dx = -r; dx <= r && !spot; dx++)
          if (sim.canPlace('balai_pahlawan', s.x + dx, s.y + dz)) spot = { x: s.x + dx, z: s.y + dz };
    const vil = [];
    sim.pool.forEach((e) => { if (e.owner === 0 && e.protoId === 'penduduk') vil.push(e.id); });
    sim.cmdBuild(vil, 'balai_pahlawan', spot.x, spot.z);
    cameraRig.target.x = spot.x + 1; cameraRig.target.z = spot.z + 1; cameraRig.targetDist = 16;
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/ui-02-construction.png` });

  // train javelin throwers + watch them throw
  await page.evaluate(() => {
    const { sim, cameraRig } = window.__panji;
    const s = sim.grid.startZones[0];
    const throwers = [];
    for (let i = 0; i < 4; i++) throwers.push(sim.spawnUnit('pelempar_lembing', 0, s.x - 2 + i, s.y + 6).id);
    for (let i = 0; i < 3; i++) sim.spawnUnit('pahlawan_kampilan', 1, s.x + (i - 1), s.y + 11);
    sim.cmdAttackMove(throwers, s.x, s.y + 11, 0);
    cameraRig.target.x = s.x; cameraRig.target.z = s.y + 8; cameraRig.targetDist = 16;
  });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${SHOTS}/ui-03-javelin.png` });

  // select one javelin thrower to show its portrait
  await page.evaluate(() => {
    const { sim, input } = window.__panji;
    let t = null;
    sim.pool.forEach((e) => { if (e.owner === 0 && e.protoId === 'pelempar_lembing' && e.alive) t = e; });
    if (t) input.setSelection([t.id]);
  });
  await page.waitForTimeout(500);
  const portraitName = await page.evaluate(() => document.querySelector('#panel .sel-name')?.textContent);
  console.log(`[desktop] selected unit portrait: ${portraitName}`);
  await page.screenshot({ path: `${SHOTS}/ui-04-portrait.png` });
  await page.context().close();
}

// ---------- MOBILE ----------
{
  const page = await newPage(390, 780, true);
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.evaluate(cheats);

  const touchOn = await page.evaluate(() => document.body.classList.contains('touch'));
  const ctrlVisible = await page.evaluate(() => {
    const tc = document.getElementById('touch-controls');
    return getComputedStyle(tc).display !== 'none';
  });
  console.log(`[mobile] body.touch=${touchOn}, touch-controls visible=${ctrlVisible}`);

  // tap-select a villager via the touch handler
  const tapResult = await page.evaluate(() => {
    const { sim, gameRenderer, touch } = window.__panji;
    let v = null;
    sim.pool.forEach((e) => { if (e.owner === 0 && e.protoId === 'penduduk' && !v) v = e; });
    const cam = gameRenderer.camera;
    const P = Object.getPrototypeOf(cam.position).constructor;
    window.__panji.cameraRig.target.x = v.x;
    window.__panji.cameraRig.target.z = v.z;
    window.__panji.cameraRig.targetDist = 20;
    return true;
  });
  await page.waitForTimeout(700);
  // simulate a tap at screen center (villager is centered)
  await page.evaluate(() => {
    window.__panji.touch.handleTap(window.innerWidth / 2, window.innerHeight / 2);
  });
  await page.waitForTimeout(500);
  const sel = await page.evaluate(() => window.__panji.input.selection.size);
  const panelShown = await page.evaluate(() => getComputedStyle(document.getElementById('panel')).display !== 'none');
  console.log(`[mobile] tap selected ${sel} unit(s), panel shown=${panelShown}`);
  await page.screenshot({ path: `${SHOTS}/ui-05-mobile.png` });

  // pinch zoom test (programmatic): set targetDist and confirm clamp
  const zoom = await page.evaluate(() => {
    const r = window.__panji.cameraRig;
    const before = r.targetDist;
    document.getElementById('zoom-in').click();
    return { before, after: r.targetDist };
  });
  console.log(`[mobile] zoom-in button: ${zoom.before.toFixed(1)} -> ${zoom.after.toFixed(1)}`);
  await page.context().close();
}

console.log(`\nProblems: ${problems.length}`);
for (const p of problems) console.log('  ' + p);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
