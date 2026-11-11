// Records a narrated end-to-end run: real Taipei page + extension drawer → applicant flow → officer → revision → approve → tamper.
// Needs `npm run dev` on :5173. Output: demo/zero-form-demo.webm
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = 'http://localhost:5173', GOV = 'https://tcooc-co.gov.taipei/cp.aspx?n=1ddc8c221b97a1bd&s=5BA095ECA5D6FAB3';
const OUT = path.resolve('demo'), VID = fs.mkdtempSync(path.join(os.tmpdir(), 'zf-vid-'));
await fetch(APP + '/api/demo/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'zf-prof-')), {
  channel: 'chromium', headless: true, viewport: { width: 1440, height: 900 },
  recordVideo: { dir: VID, size: { width: 1440, height: 900 } },
  args: [`--disable-extensions-except=${path.resolve('extension')}`, `--load-extension=${path.resolve('extension')}`],
});
for (const p of ['local-network-access', 'local-network', 'loopback-network']) { try { await ctx.grantPermissions([p], { origin: 'https://tcooc-co.gov.taipei' }); } catch {} }
const page = ctx.pages()[0] ?? await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
const caption = (text) => page.evaluate((t) => {
  let el = document.getElementById('zf-cap');
  if (!el) { el = document.createElement('div'); el.id = 'zf-cap'; el.style.cssText = 'position:fixed;left:24px;bottom:24px;z-index:2147483647;max-width:380px;background:#0E1116;color:#fff;font:600 17px/1.4 Inter,system-ui,sans-serif;padding:14px 18px;border-radius:12px;box-shadow:0 10px 30px #0006;transition:opacity .3s'; document.documentElement.appendChild(el); }
  el.textContent = t;
}, text);
const app = async () => { for (let i = 0; i < 50; i++) { const f = page.frames().find((x) => x.url().startsWith(APP)); if (f) { await f.waitForSelector('main section'); return f; } await wait(200); } throw new Error('drawer frame not found'); };
const openDrawer = async (cap) => {
  await page.goto(GOV, { waitUntil: 'domcontentloaded' }); await wait(1500);
  await page.locator('button.start').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -120));
  await caption(cap); await wait(3500);
  await page.click('button.start'); await wait(1200);
  return app();
};
const answer = async (f, text, pause = 1400) => { await f.fill('#qi', ''); await f.type('#qi', text, { delay: 70 }); await wait(pause); await f.press('#qi', 'Enter'); await wait(900); };

// 1 · applicant on the real government page
await page.goto(GOV, { waitUntil: 'domcontentloaded' }); await wait(1000);
await caption('The real Taipei City page to register a company: 7 separate forms to download and fill by hand.'); await wait(3000);
let f = await openDrawer('Zero Form adds one button to the existing site. No new portal.');
await caption('Sign in with a one-time code to the phone number you already verified.'); await wait(2500);
await f.click('text=Get started'); await wait(1500); await f.click('.sms'); await wait(1800);
await caption('Zero refill: facts you already verified are reused, with their source shown.'); await wait(4000);
await f.click('text=Yes, use these'); await wait(1200);
await caption('Only what is missing is asked, one question at a time. Watch every form fill live on the right.');
await answer(f, '臺北市大安區復興南路一段 390 號 5 樓');
await answer(f, '1000000');
await answer(f, '吳小明');
await caption('Inputs are validated: a national ID with a wrong checksum is caught immediately.');
await answer(f, 'A123456788', 1200); await wait(1500);
await caption('Fixed. 5 answers fill 40 fields across 7 forms.');
await answer(f, 'F123456784');
await answer(f, '林美華');
await caption('Check once. Signing locks this exact version: its SHA-256 fingerprint.'); await wait(3500);
await f.click('text=Sign & submit'); await wait(1500); await f.click('.sms'); await wait(1800);
await caption('Submitted. 6 documents generated from one signed snapshot.'); await wait(4000);

// 2 · officer
await page.goto(APP + '/officer.html'); await wait(800);
await caption('Officer console: 5 checks computed live, not decorative.'); await wait(4500);
await page.click('tr[data-k="company.capital"]'); await wait(800);
await page.type('#note', 'Bank deposit proof shows NT$ 800,000. Please correct the capital.', { delay: 25 }); await wait(800);
await caption('The officer asks for one field to be fixed, not the whole application.');
await page.click('#revise'); await wait(3000);

// 3 · applicant fixes only that field
f = await openDrawer('Back on the government page, the applicant sees exactly what to fix.');
await wait(2500); await f.click('[data-go="fix"]'); await wait(1000);
await caption('Everything else stays locked. Only the capital is reopened.');
await answer(f, '800000');
await wait(1500); await f.click('text=Sign & submit'); await wait(1500); await f.click('.sms'); await wait(1500);
await caption('Re-signed as version 2, linked to version 1.'); await wait(3500);

// 4 · officer approves, docs, tamper
await page.goto(APP + '/officer.html'); await wait(800);
await caption('v2 replaces v1. Only one field changed, and all checks pass.'); await wait(4000);
await page.click('#approve'); await wait(1500);
await caption('Approved. The applicant sees it instantly.'); await wait(2500);
await page.goto(APP + '/doc/2/t70126'); await wait(500);
await caption('Every document is generated from the signed snapshot, and its hash is printed on it.'); await wait(4500);
await page.goto(APP + '/officer.html'); await wait(800);
await caption('What if someone alters the stored data after signing?'); await wait(2000);
await page.click('#tamper'); await wait(1200);
await caption('Integrity, identity and consistency checks turn red. Tampering is detected.'); await wait(4500);

const video = page.video();
await ctx.close();
const src = await video.path();
fs.copyFileSync(src, path.join(OUT, 'zero-form-demo.webm'));
console.log('saved', path.join(OUT, 'zero-form-demo.webm'));
await fetch(APP + '/api/demo/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
