// Phase 10 verification (UI/flows) — settings overlay, map-seed picker, and
// the save → resume round-trip through the actual screens. Headless Chromium.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-gpu'] });
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failed++; };

const ctx = await browser.newContext({ viewport: { width: 1100, height: 680 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

// clear any prior save so the "no resume" state is deterministic
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.removeItem('panji.save'));

// --- title → settings ------------------------------------------------------
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.dedication', { timeout: 8000 });
await page.click('.dedication');
await page.waitForSelector('.screen-overlay', { timeout: 8000 });
const hasResumeBefore = await page.$$eval('.diff-btn', (b) => b.some((x) => x.textContent.includes('Resume')));
check('no Resume button before any save', hasResumeBefore === false);

// open settings from the title
await page.click('text=⚙ Settings');
await page.waitForSelector('.settings-panel', { timeout: 5000 });
const sliders = await page.$$('.settings-slider');
check('settings panel has volume sliders', sliders.length >= 3, `${sliders.length}`);
// move the master slider and confirm it applies to the (unlocked) audio bus
await page.mouse.click(550, 340); // gesture to unlock audio
const volApplied = await page.evaluate(() => {
  const s = document.querySelector('.settings-slider');
  s.value = '40'; s.dispatchEvent(new Event('input', { bubbles: true }));
  return { stored: localStorage.getItem('panji.vol.master') };
});
check('moving master slider persists volume', parseFloat(volApplied.stored) <= 0.45 + 1e-6 && parseFloat(volApplied.stored) >= 0.35);
// graphics quality buttons present
const gfx = await page.$$eval('.settings-panel .diff-btn', (b) => b.map((x) => x.textContent));
check('graphics quality presets present', gfx.some((t) => t === 'Low') && gfx.some((t) => t === 'High'), gfx.join(','));
await page.click('text=Done');

// --- faction select has the map-seed picker --------------------------------
await page.waitForSelector('.screen-overlay', { timeout: 5000 });
await page.click('text=Play');
await page.waitForSelector('.faction-grid', { timeout: 5000 });
check('map-seed input present', (await page.$('.seed-input')) !== null);
const seedBefore = await page.$eval('.seed-input', (e) => e.value);
await page.click('text=🎲 New map');
const seedAfter = await page.$eval('.seed-input', (e) => e.value);
check('re-roll changes the seed', seedBefore !== seedAfter, `${seedBefore} → ${seedAfter}`);

// --- save (F5) then resume from a fresh load -------------------------------
await page.goto(`${BASE}/?quickstart`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__panji?.sim, { timeout: 15000 });
await page.waitForTimeout(1500); // let some ticks accrue
await page.keyboard.press('F5');
await page.waitForTimeout(200);
const saved = await page.evaluate(() => {
  const raw = localStorage.getItem('panji.save');
  if (!raw) return null;
  const s = JSON.parse(raw);
  return { tick: s.tick, ents: s.entities.length };
});
check('F5 writes a save', saved && saved.tick > 0, saved ? `tick=${saved.tick}, ents=${saved.ents}` : 'none');

// reload to the title; Resume should now appear and restore the match
const page2 = await ctx.newPage();
const errors2 = [];
page2.on('console', (m) => { if (m.type() === 'error') errors2.push(m.text()); });
page2.on('pageerror', (e) => errors2.push(String(e)));
await page2.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page2.waitForSelector('.dedication', { timeout: 8000 });
await page2.click('.dedication');
await page2.waitForSelector('.screen-overlay', { timeout: 8000 });
const hasResumeNow = await page2.$$eval('.diff-btn', (b) => b.some((x) => x.textContent.includes('Resume')));
check('Resume button appears after a save', hasResumeNow === true);
await page2.click('text=Resume last game');
await page2.waitForFunction(() => window.__panji?.sim, { timeout: 15000 });
await page2.waitForTimeout(800);
const resumed = await page2.evaluate(() => ({ tick: window.__panji.sim.tick, running: !window.__panji.sim.winner || window.__panji.sim.winner < 0 }));
check('resumed match restored at saved tick', resumed.tick >= (saved?.tick ?? 1e9), `resumed tick=${resumed.tick}`);

const allErr = errors.concat(errors2);
check('no console errors across flows', allErr.length === 0, allErr.slice(0, 3).join(' | '));

await browser.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
