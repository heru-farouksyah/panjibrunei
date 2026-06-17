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
  check('menu visible', await vis(page, '#menu-btn'));
  check('control-group bar hidden by default (opt-in in Settings)', !(await vis(page, '#group-bar')));
  check('Stop / Select buttons removed', await page.evaluate(() => !document.getElementById('btn-stop') && !document.getElementById('btn-select')));
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

  // box-select grabs on-screen units (now long-press only — no toggle button)
  const box = await page.evaluate(() => {
    const { input } = window.__panji;
    input.setSelection([]); input.boxSelect(0, 0, innerWidth, innerHeight, false);
    return { selected: input.selection.size };
  });
  check('box-select grabs on-screen units', box.selected > 0, `${box.selected} units`);

  // BUG FIX: a held touch must NOT arm box-select while a unit is selected
  // (so press-hold on a tree gathers instead of the box "sticking to the finger").
  const heldWithSel = await page.evaluate(async () => {
    const { touch, input, sim } = window.__panji;
    touch.selectMode = false;
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

  // ORDER release flow (all units): a tap aims (no order yet), ✓ commits it
  const order = await page.evaluate(() => {
    const { touch, input, sim } = window.__panji;
    let uid = -1; sim.pool.forEach((e) => { if (uid < 0 && e.kind === 'unit' && e.owner === 0) uid = e.id; });
    input.setSelection([uid]);
    // find a screen point that's empty ground (no entity under it) to aim at
    let pt = null;
    for (const [sx, sy] of [[700, 300], [760, 260], [820, 330], [650, 360], [500, 360], [760, 180], [600, 320]]) {
      if (!input.pickEntity(sx, sy) && input.groundAt(sx, sy)) { pt = [sx, sy]; break; }
    }
    if (!pt) return { skip: true };
    touch.aim = null;
    touch.handleTap(pt[0], pt[1]);             // aim only — must NOT issue an order
    const aimed = !!touch.aim;
    const bubble = getComputedStyle(document.getElementById('place-confirm')).display !== 'none';
    touch.onConfirm();                          // ✓ commits the order
    return { aimed, bubble, committed: touch.aim === null };
  });
  check('tap a spot AIMS the order (bubble shown, not issued)', order.skip || (order.aimed && order.bubble), order.skip ? 'no empty point' : '');
  check('✓ commits the unit order + clears aim', order.skip || order.committed);

  // command card auto-collapses to the left icon on unit select; portrait reopens
  const card = await page.evaluate(() => {
    const { input, sim, hud } = window.__panji;
    let id = -1; sim.pool.forEach((e) => { if (id < 0 && e.kind === 'unit' && e.owner === 0) id = e.id; });
    input.setSelection([id]); hud.refreshPanel();
    const collapsed = document.getElementById('panel').classList.contains('cmd-collapsed');
    document.querySelector('#panel .portrait').click();
    const expanded = !document.getElementById('panel').classList.contains('cmd-collapsed');
    return { collapsed, expanded };
  });
  check('command card auto-collapses to icon + portrait reopens', card.collapsed && card.expanded);

  // building placement: release bubble exists, tap aims, ✓ commits at the exact
  // validated tile (regression: the old reprojection could fail → green→red).
  const place = await page.evaluate(() => {
    const { touch, hud, sim, input } = window.__panji;
    let id = -1; sim.pool.forEach((e) => { if (id < 0 && e.kind === 'unit' && e.owner === 0 && e.proto.tags?.includes('villager')) id = e.id; });
    input.setSelection([id]);
    hud.startPlacement('rumah_kampong');
    const bubble = !!document.getElementById('place-confirm');
    touch.handleTap(450, 220);
    const armed = touch.bubbleArmed;
    // aim at a genuinely placeable tile near the start
    const s = sim.grid.startZones[0]; let tile = null;
    for (let r = 2; r < 16 && !tile; r++) for (let dz = -r; dz <= r && !tile; dz++) for (let dx = -r; dx <= r && !tile; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (sim.canPlace('rumah_kampong', s.x + dx, s.y + dz)) tile = { tx: s.x + dx, tz: s.y + dz };
    }
    hud.ghostTile = tile; touch.bubbleArmed = true;
    const before = (() => { let n = 0; sim.pool.forEach((e) => { if (e.kind === 'building' && e.owner === 0) n++; }); return n; })();
    touch.confirmPlace();
    const after = (() => { let n = 0; sim.pool.forEach((e) => { if (e.kind === 'building' && e.owner === 0) n++; }); return n; })();
    return { bubble, armed, built: after > before, ended: !hud.isPlacing(), red: document.getElementById('place-confirm').classList.contains('invalid') };
  });
  check('build: release bubble + ✓ commits, placement ends, no red flip',
    place.bubble && place.armed && place.built && place.ended && !place.red);

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
  // select a unit (card auto-collapses), then expand via the portrait: the
  // roomy tablet card keeps the unit info panel when open
  const tabletPanel = await page.evaluate(() => {
    const { input, sim, hud } = window.__panji;
    let id = -1; sim.pool.forEach((e) => { if (id < 0 && e.kind === 'unit' && e.owner === 0) id = e.id; });
    input.setSelection([id]); hud.refreshPanel();
    document.querySelector('#panel .portrait').click(); // expand
    const info = document.querySelector('#panel .sel-info');
    return getComputedStyle(info).display !== 'none' && info.offsetWidth > 0;
  });
  check('tablet keeps the unit info panel when expanded', tabletPanel);
  check('tablet: no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.screenshot({ path: '/tmp/mobile-tablet.png' });
  await ctx.close();
}

await browser.close();
console.log(fail ? `\n${fail} CHECK(S) FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
