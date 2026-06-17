// Campaign / engagement-layer verification. Part A unit-tests the profile module
// (XP/levels, mission stars, daily streak, chest) in pure Node; Part B drives the
// real flow in a browser via file://: title → Campaign → journey map → daily
// reward → mission brief → match start.
import { chromium } from 'playwright';
import { defaultProfile, addXp, completeMission, checkDaily, openChest, levelXp, totalStars } from '../src/render/profile.js';

let fail = 0;
const check = (n, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fail++; };

// ---- Part A: profile logic ----
console.log('— profile module —');
{
  const p = defaultProfile();
  const r = addXp(p, levelXp(1) + 5);
  check('addXp levels up', p.level === 2 && r.levels.includes(2));
  check('level 2 grants an unlock', r.unlocks.length > 0, r.unlocks.map((u) => u.name).join(','));

  const p2 = defaultProfile();
  const res = completeMission(p2, 'muara', 2, 120);
  check('completeMission records stars', p2.stars.muara === 2 && totalStars(p2) === 2);
  check('completeMission awards xp/pass', p2.pass.xp > 0 && (p2.xp > 0 || p2.level > 1));
  // re-clearing with fewer stars keeps the best
  completeMission(p2, 'muara', 1, 50);
  check('stars keep the best result', p2.stars.muara === 2);

  const p3 = defaultProfile();
  const daily = checkDaily(p3);
  check('daily reward on a new day', daily && daily.streak === 1);
  check('daily is once per day', checkDaily(p3) === null);

  const p4 = defaultProfile(); p4.chests = 1;
  const win = openChest(p4);
  check('chest opens with a payout', ['xp', 'chest'].includes(win.kind), `${win.kind}/${win.rarity}`);
}

// ---- Part B: UI flow ----
console.log('— campaign flow (file://) —');
const FILE = 'file:///home/ubuntu/panji-brunei/dist/index.html';
const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-gpu', '--allow-file-access-from-files'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(FILE, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
// disclaimer → title
await page.waitForSelector('.dedication', { timeout: 8000 }); await page.click('.dedication');
await page.waitForSelector('.screen-overlay .start-btn', { timeout: 8000 });
check('title shows a Campaign button', await page.evaluate(() => [...document.querySelectorAll('.start-btn')].some((b) => /Campaign/i.test(b.textContent))));
// click Campaign (first start-btn)
await page.click('.start-btn');
await page.waitForSelector('.camp-svg', { timeout: 8000 });
await page.waitForTimeout(300);
const map = await page.evaluate(() => ({
  nodes: document.querySelectorAll('.cnode').length,
  open: document.querySelectorAll('.cnode.open').length,
  locked: document.querySelectorAll('.cnode.locked').length,
  header: !!document.querySelector('.camp-header'),
  daily: !!document.querySelector('.camp-modal-ov'),
  saved: !!localStorage.getItem('panji.profile'),
}));
check('journey map: 7 mission nodes + roads', map.nodes === 7);
check('first node open, rest locked (progression)', map.open === 1 && map.locked === 6);
check('profile header shown', map.header);
check('daily reward popped on first visit', map.daily);
check('profile saved to localStorage', map.saved);
await page.screenshot({ path: '/tmp/campaign-map.png' });
// dismiss daily, open the first mission brief, march
await page.evaluate(() => document.querySelector('.camp-modal-ov')?.remove());
await page.click('.cnode.open[data-id="muara"]');
await page.waitForSelector('.camp-modal', { timeout: 6000 });
check('mission brief modal opens', await page.evaluate(() => /March/i.test(document.querySelector('.camp-modal')?.textContent || '')));
await page.evaluate(() => [...document.querySelectorAll('.camp-modal .modal-btn')].find((b) => /March/i.test(b.textContent))?.click());
await page.waitForFunction(() => window.__panji?.gameRenderer, { timeout: 30000 });
check('mission launches an RTS match', await page.evaluate(() => !!window.__panji?.sim));
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(fail ? `\n${fail} CHECK(S) FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
