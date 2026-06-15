// Phase 12 — final QA sweep. Loads every environment theme error-free, verifies
// the graphics-quality presets actually change the renderer, and confirms the
// boot splash is dismissed. Pair with the sim suite for the full gate.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-gpu'] });
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failed++; };

// --- every theme renders with zero console errors --------------------------
for (const theme of ['tropical', 'water_village', 'mountain']) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?quickstart&theme=${theme}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__panji?.gameRenderer, { timeout: 15000 });
  await page.waitForTimeout(1200);
  const ok = await page.evaluate(() => {
    const gr = window.__panji.gameRenderer;
    return { boot: !document.getElementById('boot'), loading: !document.getElementById('loading-screen'),
      theme: gr.theme?.name, scene: gr.scene.children.length };
  });
  check(`theme ${theme}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  check(`theme ${theme}: boot+loading dismissed`, ok.boot && ok.loading);
  await page.close();
}

// --- graphics presets change the renderer ----------------------------------
async function bootWithGfx(level) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  await page.addInitScript((lvl) => localStorage.setItem('panji.gfx', lvl), level);
  await page.goto(`${BASE}/?quickstart`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__panji?.gameRenderer, { timeout: 15000 });
  const g = await page.evaluate(() => ({
    shadows: window.__panji.gameRenderer.renderer.shadowMap.enabled,
    gfx: window.__panji.gameRenderer.gfx,
  }));
  await page.close();
  return g;
}
const low = await bootWithGfx('low');
const high = await bootWithGfx('high');
check('Low preset disables shadows', low.shadows === false, `shadows=${low.shadows}`);
check('High preset enables shadows', high.shadows === true);
check('Low preset caps pixel ratio at 1', low.gfx.pixelRatio === 1, `pr=${low.gfx.pixelRatio}`);
check('Low preset reduces ambient density', low.gfx.ambient < high.gfx.ambient, `${low.gfx.ambient} < ${high.gfx.ambient}`);

await browser.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
