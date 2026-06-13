// Headless browser check for Phase 3: HUD, gather orders, ghost placement,
// construction, training. Software rendering — sim runs below real time.
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

await page.evaluate(() => {
  const { cameraRig } = window.__panji;
  cameraRig.target.x = 19;
  cameraRig.target.z = 20;
  cameraRig.targetDist = 26;
});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/p3-01-base.png` });

// helper: screen position of a world point
const toScreen = async (wx, wz) =>
  page.evaluate(([x, z]) => {
    const { gameRenderer, sim } = window.__panji;
    const cam = gameRenderer.camera;
    const P = Object.getPrototypeOf(cam.position).constructor;
    const p = new P(x, sim.grid.heightAt(x, z), z);
    p.project(cam);
    return { x: (p.x + 1) * 0.5 * innerWidth, y: (-p.y + 1) * 0.5 * innerHeight };
  }, [wx, wz]);

// select villagers by drag over the base area
const istanaPos = await page.evaluate(() => {
  const { sim } = window.__panji;
  let pos = null;
  sim.pool.forEach((e) => {
    if (e.owner === 0 && e.protoId === 'istana') pos = { x: e.x, z: e.z };
  });
  return pos;
});
const c1 = await toScreen(istanaPos.x - 4, istanaPos.z - 4);
const c2 = await toScreen(istanaPos.x + 4, istanaPos.z + 6);
await page.mouse.move(c1.x, c1.y);
await page.mouse.down();
await page.mouse.move(c2.x, c2.y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(300);
const selCount = await page.evaluate(() => window.__panji.input.selection.size);
console.log(`selected (expect 3 villagers): ${selCount}`);

// right-click the sago grove -> gather
const sago = await page.evaluate(() => {
  const { sim } = window.__panji;
  const start = sim.grid.startZones[0];
  for (let r = 1; r < 20; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = start.x + dx;
        const z = start.y + dz;
        if (sim.grid.typeAt(x, z) === 8) return { x: x + 0.5, z: z + 0.5 };
      }
    }
  }
  return null;
});
console.log(`sago grove at: ${sago?.x}, ${sago?.z}`);
const sagoScreen = await toScreen(sago.x, sago.z);
await page.mouse.click(sagoScreen.x, sagoScreen.y, { button: 'right' });
await page.waitForTimeout(500);
const gatherStates = await page.evaluate(() => {
  const { sim } = window.__panji;
  const states = [];
  sim.pool.forEach((e) => {
    if (e.owner === 0 && e.protoId === 'penduduk') states.push(e.state);
  });
  return states;
});
console.log(`villager states after gather order: ${gatherStates.join(', ')}`);

// open build menu (panel should show for villagers) and place a Rumah
const panelVisible = await page.evaluate(
  () => document.getElementById('panel').style.display !== 'none'
);
console.log(`panel visible: ${panelVisible}`);
await page.click('button:has-text("Rumah Kampong")');
await page.waitForTimeout(300);
const spot = await toScreen(istanaPos.x - 4.5, istanaPos.z + 4.5);
await page.mouse.move(spot.x, spot.y);
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/p3-02-ghost.png` });
await page.mouse.click(spot.x, spot.y);
await page.waitForTimeout(500);
const foundation = await page.evaluate(() => {
  const { sim } = window.__panji;
  let f = null;
  sim.pool.forEach((e) => {
    if (e.owner === 0 && e.protoId === 'rumah_kampong') {
      f = { complete: e.complete, progress: e.buildProgress };
    }
  });
  return f;
});
console.log(`rumah foundation: ${JSON.stringify(foundation)}`);

// wait for construction (villagers were selected, so they were assigned)
let rumahDone = false;
for (let i = 0; i < 30 && !rumahDone; i++) {
  await page.waitForTimeout(2000);
  rumahDone = await page.evaluate(() => {
    const { sim } = window.__panji;
    let done = false;
    sim.pool.forEach((e) => {
      if (e.owner === 0 && e.protoId === 'rumah_kampong' && e.complete) done = true;
    });
    return done;
  });
}
console.log(`rumah completed: ${rumahDone}`);
const popCap = await page.evaluate(() => window.__panji.sim.players[0].popCap);
console.log(`pop cap after rumah: ${popCap} (expect 15)`);

// select istana, train a villager via the button
const istanaScreen = await toScreen(istanaPos.x, istanaPos.z);
await page.mouse.click(istanaScreen.x, istanaScreen.y);
await page.waitForTimeout(400);
const trained = await page
  .click('button:has-text("Penduduk")', { timeout: 3000 })
  .then(() => true)
  .catch(() => false);
await page.waitForTimeout(300);
const queueLen = await page.evaluate(() => {
  const { sim } = window.__panji;
  let q = 0;
  sim.pool.forEach((e) => {
    if (e.owner === 0 && e.protoId === 'istana') q = e.queue.length;
  });
  return q;
});
console.log(`train button clicked: ${trained}, istana queue: ${queueLen}`);

await page.waitForTimeout(1000);
await page.screenshot({ path: `${SHOTS}/p3-03-hud.png` });

console.log(`Problems: ${problems.length}`);
for (const p of problems) console.log('  ' + p);
await browser.close();

const ok =
  selCount === 3 &&
  gatherStates.some((s) => s.startsWith('toGather') || s === 'gathering') &&
  panelVisible && foundation && rumahDone && popCap === 15 && queueLen >= 1 &&
  problems.length === 0;
console.log(ok ? 'PHASE 3 VISUAL: OK' : 'PHASE 3 VISUAL: ISSUES');
process.exit(ok ? 0 : 1);
