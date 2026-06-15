// Mobile-adaptation verification (priorities 1–6). Loads the production build in
// a touch/landscape-phone context via file:// (no server — the sandbox reaps
// servers). Confirms the on-screen controls exist + work, control groups
// set/recall, box-select toggles, the menu reaches settings/save, and graphics
// auto-default to Low on a small coarse device.
import { chromium } from 'playwright';

const FILE = 'file:///home/ubuntu/panji-brunei/dist/index.html';
const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-gpu', '--allow-file-access-from-files'] });
const ctx = await browser.newContext({ viewport: { width: 880, height: 412 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

let fail = 0;
const check = (n, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fail++; };

await page.goto(`${FILE}?quickstart`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__panji?.gameRenderer, { timeout: 20000 });
await page.waitForTimeout(1200);

// P-detection + P3 controls present
check('body.touch active (coarse pointer)', await page.evaluate(() => document.body.classList.contains('touch')));
check('menu / select / group-bar visible', await page.evaluate(() => {
  const vis = (s) => { const e = document.querySelector(s); return e && getComputedStyle(e).display !== 'none' && e.offsetWidth > 0; };
  return vis('#menu-btn') && vis('#btn-select') && vis('#group-bar');
}));
check('five control-group chips', await page.$$eval('#group-bar .grp', (b) => b.length) === 5);
check('touch targets ≥44px', await page.evaluate(() => {
  return ['#menu-btn', '#btn-select', '#zoom-in', '#btn-stop'].every((s) => {
    const r = document.querySelector(s).getBoundingClientRect(); return Math.min(r.width, r.height) >= 44;
  });
}));

// P6: auto-Low on a small coarse device (no stored pref)
check('graphics auto-default Low (shadows off)', await page.evaluate(() => window.__panji.gameRenderer.gfx.shadows === false));

// P4: control group set + recall (logic via the exposed touch controller)
const grp = await page.evaluate(() => {
  const { touch, input, sim } = window.__panji;
  // select the first owned unit
  let uid = -1; sim.pool.forEach((e) => { if (uid < 0 && e.kind === 'unit' && e.owner === 0) uid = e.id; });
  input.setSelection([uid]);
  touch.setGroup(2);                 // assign group 2
  input.setSelection([]);            // clear
  touch.recallGroup(2);              // recall
  return { uid, recalled: [...input.selection] };
});
check('control group set + recall restores selection', grp.recalled.length === 1 && grp.recalled[0] === grp.uid);

// P2: box-select toggle + selection over the screen
const box = await page.evaluate(() => {
  const { touch, input } = window.__panji;
  document.getElementById('btn-select').click();   // toggle select mode
  const active = touch.selectMode;
  input.setSelection([]);
  input.boxSelect(0, 0, window.innerWidth, window.innerHeight, false); // whole screen
  return { active, selected: input.selection.size };
});
check('box-select mode toggles on', box.active === true);
check('box-select grabs on-screen units', box.selected > 0, `${box.selected} units`);

// P1: menu → save + settings reachable
await page.click('#menu-btn');
check('menu opens', await page.evaluate(() => getComputedStyle(document.getElementById('touch-menu')).display !== 'none'));
await page.click('#touch-menu [data-act="save"]');
check('menu Save writes a save', await page.evaluate(() => !!localStorage.getItem('panji.save')));
await page.click('#menu-btn');
await page.click('#touch-menu [data-act="settings"]');
await page.waitForTimeout(200);
check('menu Settings opens settings panel', await page.evaluate(() => !!document.querySelector('.settings-panel')));
await page.screenshot({ path: '/tmp/mobile-settings.png' });
// close settings, screenshot the in-game mobile HUD with menu open
await page.evaluate(() => document.querySelector('.settings-screen .start-btn')?.click());
await page.waitForTimeout(150);
await page.click('#menu-btn');
await page.screenshot({ path: '/tmp/mobile-hud.png' });

check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(fail ? `\n${fail} CHECK(S) FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
