// Mobile-adaptation verification. Loads the production build via file:// (no
// server — the sandbox reaps servers) in two touch contexts — a phone and a
// tablet — and checks the on-screen controls, the top-left pause/resume toggle,
// control groups, box-select, the menu (settings/save), and the phone-vs-tablet
// command-card differentiation.
import { chromium } from 'playwright';

const FILE = 'file:///home/ubuntu/panji-brunei/dist/index.html';
const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-gpu', '--allow-file-access-from-files'] });

let fail = 0;
const check = (n, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fail++; };
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.offsetWidth > 0; }, sel);

async function open(viewport) {
  // deviceScaleFactor 1: a 2x backing store at tablet size is very slow under
  // SwiftShader (software GL) and can stall init; scale doesn't affect the
  // phone/tablet classification (that's screen size).
  const ctx = await browser.newContext({ viewport, screen: viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${FILE}?quickstart`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__panji?.gameRenderer, { timeout: 45000 });
  await page.waitForTimeout(1000);
  return { ctx, page, errors };
}

// ---------------- PHONE ----------------
{
  console.log('— phone (880×412) —');
  const { ctx, page, errors } = await open({ width: 880, height: 412 });
  check('classes: touch + phone (not tablet)', await page.evaluate(() => {
    const c = document.body.classList; return c.contains('touch') && c.contains('phone') && !c.contains('tablet');
  }));
  check('menu in top-left + ≥44px', await page.evaluate(() => {
    const r = document.getElementById('menu-btn')?.getBoundingClientRect();
    return r && r.left < 70 && r.top < 80 && Math.min(r.width, r.height) >= 44;
  }));
  check('no separate pause button (folded into menu)', await page.evaluate(() => !document.getElementById('pause-btn')));
  check('menu / select / group-bar visible', (await vis(page, '#menu-btn')) && (await vis(page, '#btn-select')) && (await vis(page, '#group-bar')));
  check('phone hides zoom buttons (pinch instead)', !(await vis(page, '#zoom-in')) && !(await vis(page, '#zoom-out')));
  check('phone hides unit info panel', !(await vis(page, '#panel .sel-info')));
  check('graphics auto-Low (shadows off)', await page.evaluate(() => window.__panji.gameRenderer.gfx.shadows === false));

  // pause/resume now lives in the menu (the ‹ button was removed as redundant)
  await page.click('#menu-btn'); await page.waitForTimeout(150);
  check('menu has a pause/resume action', await page.evaluate(() => !!document.querySelector('#touch-menu [data-act="pause"]')));
  await page.click('#touch-menu [data-act="pause"]'); await page.waitForTimeout(200); // pauses + closes menu
  await page.click('#menu-btn'); await page.waitForTimeout(150);                       // reopen
  check('menu pause flips to Resume when paused', await page.evaluate(() => document.querySelector('#touch-menu [data-act="pause"]').textContent.trim() === 'Resume'));
  await page.click('#touch-menu [data-act="pause"]'); await page.waitForTimeout(150);  // resume back

  // control group set + recall
  const grp = await page.evaluate(() => {
    const { touch, input, sim } = window.__panji;
    let uid = -1; sim.pool.forEach((e) => { if (uid < 0 && e.kind === 'unit' && e.owner === 0) uid = e.id; });
    input.setSelection([uid]); touch.setGroup(2); input.setSelection([]); touch.recallGroup(2);
    return { uid, recalled: [...input.selection] };
  });
  check('control group set + recall', grp.recalled.length === 1 && grp.recalled[0] === grp.uid);

  // box-select toggle + selection
  const box = await page.evaluate(() => {
    const { touch, input } = window.__panji;
    document.getElementById('btn-select').click();
    input.setSelection([]); input.boxSelect(0, 0, innerWidth, innerHeight, false);
    return { active: touch.selectMode, selected: input.selection.size };
  });
  check('box-select toggles + grabs units', box.active && box.selected > 0, `${box.selected} units`);

  // BUG FIX: a held touch must NOT arm box-select while a unit is selected
  // (so press-hold on a tree gathers instead of the box "sticking to the finger").
  const heldWithSel = await page.evaluate(async () => {
    const { touch, input, sim } = window.__panji;
    document.getElementById('btn-select').classList.remove('active'); touch.selectMode = false;
    let uid = -1; sim.pool.forEach((e) => { if (uid < 0 && e.kind === 'unit' && e.owner === 0) uid = e.id; });
    input.setSelection([uid]);
    touch.touches.clear(); touch.boxActive = false;
    touch.onStart({ preventDefault() {}, changedTouches: [{ identifier: 1, clientX: 440, clientY: 300 }] });
    await new Promise((r) => setTimeout(r, 520));      // hold past the long-press delay
    const armed = touch.boxActive; touch.touches.clear(); touch.boxActive = false;
    return armed;
  });
  check('held touch with a unit selected does NOT box-select', heldWithSel === false);

  // ...but with nothing selected, a held still-finger SHOULD arm box-select
  const heldNoSel = await page.evaluate(async () => {
    const { touch, input } = window.__panji;
    touch.selectMode = false; input.setSelection([]);
    touch.touches.clear(); touch.boxActive = false;
    touch.onStart({ preventDefault() {}, changedTouches: [{ identifier: 2, clientX: 440, clientY: 300 }] });
    await new Promise((r) => setTimeout(r, 520));
    const armed = touch.boxActive; touch.touches.clear(); touch.boxActive = false;
    return armed;
  });
  check('held touch with no selection still arms box-select', heldNoSel === true);

  // menu → save + settings
  await page.click('#menu-btn');
  check('menu opens', await vis(page, '#touch-menu'));
  await page.click('#touch-menu [data-act="save"]');
  check('menu Save writes a save', await page.evaluate(() => !!localStorage.getItem('panji.save')));
  await page.click('#menu-btn'); await page.click('#touch-menu [data-act="settings"]'); await page.waitForTimeout(200);
  check('menu Settings opens', await page.evaluate(() => !!document.querySelector('.settings-panel')));
  await page.evaluate(() => document.querySelector('.settings-screen .start-btn')?.click());

  check('phone: no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.screenshot({ path: '/tmp/mobile-phone.png' });
  await ctx.close();
}

// ---------------- TABLET ----------------
{
  console.log('— tablet (1194×834) —');
  const { ctx, page, errors } = await open({ width: 1194, height: 834 });
  check('classes: touch + tablet (not phone)', await page.evaluate(() => {
    const c = document.body.classList; return c.contains('touch') && c.contains('tablet') && !c.contains('phone');
  }));
  check('tablet shows zoom buttons', (await vis(page, '#zoom-in')) && (await vis(page, '#zoom-out')));
  check('tablet uses bigger tiles (--tile 74px)', await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--tile').trim() === '74px'));
  // select a unit so the panel + info show
  await page.evaluate(() => { const { input, sim } = window.__panji; let id = -1; sim.pool.forEach((e) => { if (id < 0 && e.kind === 'unit' && e.owner === 0) id = e.id; }); input.setSelection([id]); });
  await page.waitForTimeout(200);
  check('tablet keeps the unit info panel', await vis(page, '#panel .sel-info'));
  check('tablet: no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.screenshot({ path: '/tmp/mobile-tablet.png' });
  await ctx.close();
}

await browser.close();
console.log(fail ? `\n${fail} CHECK(S) FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
