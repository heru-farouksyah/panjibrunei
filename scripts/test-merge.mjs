// Merge Kampong verification — loads the built merge.html via file:// (no server)
// and exercises all six components: core merge loop, generators/energy, orders,
// journey meta-progression, the mystery-box variable reward, and juice presence.
import { chromium } from 'playwright';

const FILE = 'file:///home/ubuntu/panji-brunei/dist/merge.html';
const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-gpu', '--allow-file-access-from-files'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 640 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

let fail = 0;
const check = (n, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); if (!ok) fail++; };

await page.goto(FILE, { waitUntil: 'load' });
await page.evaluate(() => { localStorage.clear(); });
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__merge, { timeout: 15000 });
await page.waitForTimeout(400);

// component #4 — journey map
const j = await page.evaluate(() => ({
  svg: !!document.querySelector('.journey-svg'),
  nodes: document.querySelectorAll('.journey .node').length,
  roads: document.querySelectorAll('.journey .road').length,
  openFirst: !!document.querySelector('.node.open[data-id="muara"]'),
  lockedExist: document.querySelectorAll('.node.locked').length > 0,
}));
check('journey map renders (light-blue gradient world)', j.svg);
check('7 journey nodes with dashed roads', j.nodes === 7 && j.roads === 6, `${j.nodes} nodes / ${j.roads} roads`);
check('first node open, later nodes locked (meta-progression)', j.openFirst && j.lockedExist);
await page.screenshot({ path: '/tmp/merge-journey.png' });

// enter a node → board + orders
await page.evaluate(() => window.__merge.enterNode('muara'));
await page.waitForTimeout(300);
const b = await page.evaluate(() => ({
  cells: document.querySelectorAll('.board .cell').length,
  gens: document.querySelectorAll('.tile.gen').length,
  orders: document.querySelectorAll('.order').length,
}));
check('board grid built', b.cells === 35, `${b.cells} cells`);
check('generators on board (#3 source)', b.gens === 4, `${b.gens} generators`);
check('3 orders shown (#2 goal layer)', b.orders === 3);

// component #1 — core merge loop
const merged = await page.evaluate(() => {
  const m = window.__merge; m.state.board['3,2'] = 'wood:0'; m.state.board['4,2'] = 'wood:0'; m.board.render();
  m.board.merge(3, 2, 4, 2);
  return { result: m.state.board['4,2'], gone: !m.state.board['3,2'], discovered: !!m.state.discovered['wood:1'] };
});
check('merge two → next tier', merged.result === 'wood:1' && merged.gone, merged.result);
check('merge discovers the new item (curiosity gap)', merged.discovered);

// component #3 — generator spends energy + spawns
const gen = await page.evaluate(() => {
  const m = window.__merge; m.state.energy = 100; m.renderTopbar();
  m.board.cooldown = {};
  const before = Object.keys(m.state.board).length;
  m.board.tapGen(0, 0); // jungle
  return { spawned: Object.keys(m.state.board).length > before, energy: m.state.energy };
});
check('generator spawns an item', gen.spawned);
check('generator spent energy', gen.energy < 100, `energy ${gen.energy}`);

// component #2 — fulfilling an order pays out
const order = await page.evaluate(() => {
  const m = window.__merge; const o = m.orders.active[0];
  // grant exactly what the order needs onto empty cells
  let placed = 0; const need = [];
  for (const it of o.items) for (let k = 0; k < it.qty; k++) need.push(it.id);
  for (let y = 0; y < m.state.rows && need.length; y++)
    for (let x = 0; x < m.state.cols && need.length; x++) {
      const key = `${x},${y}`; if (!m.state.board[key]) { m.state.board[key] = need.shift(); placed++; }
    }
  m.board.render();
  const coinsBefore = m.state.coins; const can = m.orders.canFill(o);
  if (can) m.orders.fulfill(o);
  return { can, gain: m.state.coins - coinsBefore, orders: m.orders.active.length };
});
check('order can be fulfilled from board items', order.can);
check('fulfilling pays coins + refills to 3 orders', order.gain > 0 && order.orders === 3, `+${order.gain}🪙`);

// component #5 — mystery box variable reward
const chest = await page.evaluate(() => {
  const m = window.__merge; m.state.chest.ts = 0;
  const win = m.rewards.openChest(false);
  return { kind: win.kind, rarity: win.rarity, err: win.error };
});
check('mystery box opens with a payout (#5 variable reward)', !chest.err && ['coins', 'gems', 'item'].includes(chest.kind), `${chest.kind}/${chest.rarity}`);

// component #6 — juice present
const juice = await page.evaluate(() => {
  const m = window.__merge;
  return { canvas: !!document.querySelector('.fx-canvas'), hasBurst: typeof m.juice.burst === 'function', hasShake: typeof m.juice.shake === 'function', hasSound: typeof m.juice.sound === 'function' };
});
check('juice layer present (canvas + burst/shake/sound)', juice.canvas && juice.hasBurst && juice.hasShake && juice.hasSound);

await page.screenshot({ path: '/tmp/merge-board.png' });
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(fail ? `\n${fail} CHECK(S) FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
