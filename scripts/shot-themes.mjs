// Capture a screenshot of each environment colour theme via the quickstart path.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const THEMES = ['tropical', 'water_village', 'mountain'];

const browser = await chromium.launch({
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

for (const theme of THEMES) {
  await page.goto(`${BASE}/?quickstart&theme=${theme}`, { waitUntil: 'networkidle' });
  // let the world build + a few render frames settle
  await page.waitForFunction(() => window.__panji && window.__panji.gameRenderer, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const t = window.__panji.gameRenderer.theme;
    const scene = window.__panji.gameRenderer.scene;
    return {
      themeName: t?.name,
      bg: scene.background?.getHexString?.(),
      fog: scene.fog?.color?.getHexString?.(),
      hasSky: !!scene.getObjectByName('sky'),
      hasWater: !!scene.getObjectByName('water'),
      hasTerrain: !!scene.getObjectByName('terrain'),
    };
  });
  await page.screenshot({ path: `/tmp/theme-${theme}.png` });
  console.log(`${theme}:`, JSON.stringify(info));
}

console.log(errors.length ? `CONSOLE ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
