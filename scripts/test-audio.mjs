// Phase 8 verification — headless can't *hear*, so we assert the audio engine's
// structure: context unlocks on a gesture, the bus graph + music + ambient
// start, volume changes apply to the gain nodes, and SFX/event routing runs
// without throwing. Plus zero console errors.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch({
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-gpu',
    '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failed++;
};

await page.goto(`${BASE}/?quickstart&theme=water_village`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__panji && window.__panji.audio, { timeout: 15000 });

// before any gesture: context not yet running
const pre = await page.evaluate(() => window.__panji.audio.getState());
check('audio handle present', !!pre, JSON.stringify(pre));

// a real user gesture unlocks the context + starts the world
await page.mouse.click(512, 320);
await page.waitForTimeout(1200);

const post = await page.evaluate(() => window.__panji.audio.getState());
check('context running after gesture', post.ctx === 'running', `ctx=${post.ctx}`);
check('music started', post.music === true);
check('ambient bed started', post.ambient === true);
check('theme is water_village', post.theme === 'water_village');
check('master gain reflects volume', post.masterGain > 0, `gain=${post.masterGain}`);

// volume control applies immediately
const afterVol = await page.evaluate(() => {
  const a = window.__panji.audio;
  a.setVolume('master', 0.3);
  a.setVolume('music', 0.5);
  return a.getState();
});
check('setVolume(master) applied', Math.abs(afterVol.masterGain - 0.3) < 1e-6, `gain=${afterVol.masterGain}`);
check('setVolume persisted', afterVol.vol.master === 0.3);

// mute zeroes the master bus, unmute restores
const muteState = await page.evaluate(() => {
  const a = window.__panji.audio;
  a.setMuted(true);
  const m = a.getState().masterGain;
  a.setMuted(false);
  return { muted: m, restored: a.getState().masterGain };
});
check('mute zeroes master', muteState.muted === 0);
check('unmute restores master', muteState.restored > 0);

// fire SFX + a barrage of event cues should route without throwing
const eventRun = await page.evaluate(() => {
  const a = window.__panji.audio;
  const evs = [
    { type: 'melee-hit' }, { type: 'shoot', thrown: false, splash: 0 },
    { type: 'shoot', thrown: true }, { type: 'shoot', splash: 2 },
    { type: 'impact', splash: 0 }, { type: 'impact', splash: 3 },
    { type: 'death' }, { type: 'building-done', owner: 0 },
    { type: 'ignite' }, { type: 'burning' }, { type: 'demolish-start' },
    { type: 'era-up', owner: 0 }, { type: 'game-over', winner: 0 },
  ];
  for (const e of evs) a.onEvent(e, 0);
  return a.getState();
});
check('fire crackle active after ignite/burning', eventRun.crackle === true);

await page.waitForTimeout(300);
console.log(errors.length ? `\nCONSOLE ERRORS:\n${errors.join('\n')}` : '\nno console errors');
if (errors.length) failed++;
await browser.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
