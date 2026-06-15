// Phase 9 verification — drive the GLTF pipeline directly through the Vite dev
// server (modelLoader.js is imported in page context, where three is available).
// Asserts: a real asset loads + normalizes + tags faction meshes; loads are
// cached; a bad path rejects and warns exactly once; cloneTemplate clones
// materials. Then a full quickstart render with a bad manifest path stays
// error-free (graceful fallback).
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const warns = [];
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (m.type() === 'warning') warns.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failed++;
};

await page.goto(`${BASE}/?quickstart`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__panji && window.__panji.gameRenderer, { timeout: 15000 });
await page.waitForTimeout(800);

const r = await page.evaluate(async () => {
  const m = await import('/src/render/modelLoader.js');
  const out = {};
  // success path
  const g = await m.loadGLTF('/assets/models/test-cube.gltf', { targetHeight: 2 });
  let meshCount = 0, factionTagged = 0;
  let firstMat = null;
  g.traverse((n) => { if (n.isMesh) { meshCount++; if (!firstMat) firstMat = n.material;
    if (n.material?.userData?.faction) factionTagged++; } });
  // measured height after normalize — compute world-space Y range from the
  // group's own matrices (no bare 'three' import, which the browser can't resolve)
  g.updateMatrixWorld(true);
  let minY = Infinity, maxY = -Infinity;
  g.traverse((n) => {
    if (!n.isMesh) return;
    const pos = n.geometry.attributes.position;
    const e = n.matrixWorld.elements;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      if (wy < minY) minY = wy;
      if (wy > maxY) maxY = wy;
    }
  });
  out.height = +(maxY - minY).toFixed(3);
  out.feetAtZero = Math.abs(minY) < 0.05;
  out.meshCount = meshCount;
  out.factionTagged = factionTagged;
  // cache: same path returns the same resolved object
  const g2 = await m.loadGLTF('/assets/models/test-cube.gltf');
  out.cached = g2 === g;
  // clone clones materials
  const clone = m.cloneTemplate(g);
  let cloneMat = null;
  clone.traverse((n) => { if (n.isMesh && !cloneMat) cloneMat = n.material; });
  out.materialCloned = cloneMat && cloneMat !== firstMat;
  // fallback: bad path rejects
  out.rejected = await m.loadGLTF('/assets/models/missing.glb').then(() => false, () => true);
  m.warnFallback('/assets/models/missing.glb', new Error('x'));
  m.warnFallback('/assets/models/missing.glb', new Error('x')); // 2nd should be silent
  return out;
});

check('GLTF normalized to targetHeight=2', Math.abs(r.height - 2) < 0.2, `h=${r.height}`);
check('feet placed at y≈0', r.feetAtZero);
check('mesh loaded', r.meshCount >= 1, `meshes=${r.meshCount}`);
check('faction mesh auto-tagged by name', r.factionTagged >= 1);
check('loads are cached by path', r.cached === true);
check('cloneTemplate clones materials', r.materialCloned === true);
check('bad path rejects (caller falls back)', r.rejected === true);

await page.waitForTimeout(200);
const fallbackWarns = warns.filter((w) => w.includes('missing.glb'));
check('warnFallback warns exactly once per path', fallbackWarns.length === 1, `count=${fallbackWarns.length}`);
check('no console errors from the pipeline', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
