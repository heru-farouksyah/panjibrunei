// Final full-loop verification: title -> faction select -> match (HUD,
// minimap, F1 help) -> fast-forwarded match against the AI -> end screen
// with stats graph. Runs against the production build (vite preview).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173/';
const SHOTS = '/tmp/panji-shots';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`[console.error] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

// 1. title screen
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}/p7-01-title.png` });
const titleOk = await page.evaluate(() =>
  document.querySelector('.screen-title')?.textContent === 'PANJI BRUNEI');
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Play')?.click();
});
await page.waitForTimeout(600);

// 2. faction select -> Hassan, Normal
const selectOk = await page.evaluate(() => document.querySelectorAll('.faction-card').length === 6);
await page.evaluate(() => {
  document.querySelectorAll('.faction-card')[2].click(); // Hassan
});
await page.waitForTimeout(200);
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('Begin'))?.click();
});
await page.waitForTimeout(2500);

// 3. in-match UI: minimap, idle button, F1 help
const uiOk = await page.evaluate(() => {
  return {
    minimap: !!document.getElementById('minimap'),
    idleBtn: document.getElementById('idle-btn')?.textContent ?? '',
    faction: window.__panji.sim.players[0].factionId,
    difficulty: !!window.__panji.sim.ai,
  };
});
console.log(`in-match UI: ${JSON.stringify(uiOk)}`);
await page.keyboard.press('F1');
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/p7-02-help.png` });
await page.keyboard.press('F1');

// 4. fast-forward the match in chunks until someone wins (passive player
// loses to the AI). Render frames between chunks so events flow through.
let winner = -1;
let waveShot = false;
for (let chunk = 0; chunk < 40 && winner < 0; chunk++) {
  winner = await page.evaluate(() => {
    const { sim } = window.__panji;
    for (let i = 0; i < 800 && sim.winner < 0; i++) sim.step();
    return sim.winner;
  });
  await page.waitForTimeout(250); // let a frame render + drain events
  if (!waveShot) {
    const waveActive = await page.evaluate(() => window.__panji.sim.ai.waveActive);
    if (waveActive) {
      waveShot = true;
      await page.evaluate(() => {
        const { sim, cameraRig } = window.__panji;
        const s = sim.grid.startZones[0];
        cameraRig.target.x = s.x + 2;
        cameraRig.target.z = s.y + 2;
        cameraRig.targetDist = 26;
      });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${SHOTS}/p7-03-wave.png` });
    }
  }
}
const minutes = await page.evaluate(() => (window.__panji.sim.tick / 20 / 60).toFixed(1));
console.log(`match ended: winner=${winner} at ${minutes} game-min (expect AI=1 wins vs passive player)`);

// 5. end screen with stats + graph
await page.waitForTimeout(1200);
const endOk = await page.evaluate(() => {
  const title = document.querySelector('.end-screen .screen-title')?.textContent;
  const rows = document.querySelectorAll('.stats-row').length;
  const graph = !!document.querySelector('.score-graph');
  return { title, rows, graph };
});
console.log(`end screen: ${JSON.stringify(endOk)}`);
await page.screenshot({ path: `${SHOTS}/p7-04-end.png` });

// 6. Play Again flows back into a match
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Play Again')?.click();
});
await page.waitForTimeout(3000);
const replayOk = await page.evaluate(() =>
  !!window.__panji && window.__panji.sim.tick < 2000 && window.__panji.sim.winner === -1);
console.log(`play-again restarts a fresh match: ${replayOk}`);

console.log(`Problems: ${problems.length}`);
for (const p of problems) console.log('  ' + p);
await browser.close();

const ok = titleOk && selectOk && uiOk.minimap && uiOk.faction === 'hassan' &&
  uiOk.difficulty && winner === 1 && endOk.title === 'DEFEAT' && endOk.rows >= 6 &&
  endOk.graph && replayOk && problems.length === 0;
console.log(ok ? 'PHASE 7 FULL LOOP: OK' : 'PHASE 7 FULL LOOP: ISSUES');
process.exit(ok ? 0 : 1);
