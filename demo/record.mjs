// Records a narrated end-to-end run on the native PDF engine:
// agency setup (Claude reads all 7 official PDFs once) → real Taipei page + extension drawer → 3 questions → sign (7 official PDFs) → officer requests one fix → re-sign v2
// → applicant uploads evidence PDFs → officer approves → contact sheet of every generated official PDF → tamper.
// Needs `npm run dev` on :5173 (or ZF_APP=http://localhost:<port>; the extension's localhost:5173 iframe is routed there) and the engine toolchain (see README).
// Output: demo/zero-form-all-forms.webm
// HEADED=1 opens a visible browser window so you can watch the run live.
import { chromium } from 'playwright';
import { FORMS } from '../public/schema.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.ZF_APP || 'http://localhost:5173', GOV = 'https://tcooc-co.gov.taipei/cp.aspx?n=1ddc8c221b97a1bd&s=5BA095ECA5D6FAB3';
const OUT = path.resolve('demo'), VID = fs.mkdtempSync(path.join(os.tmpdir(), 'zf-vid-')), TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'zf-files-'));
const post = (p) => fetch(APP + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
await post('/api/demo/reset');

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'zf-prof-')), {
  channel: 'chromium', headless: !process.env.HEADED, viewport: { width: 1440, height: 900 },
  recordVideo: { dir: VID, size: { width: 1440, height: 900 } },
  args: [`--disable-extensions-except=${path.resolve('extension')}`, `--load-extension=${path.resolve('extension')}`],
});
// The extension frames http://localhost:5173; send it to ZF_APP when the server runs elsewhere.
if (!APP.startsWith('http://localhost:5173')) await ctx.route('http://localhost:5173/**', async (r) => r.fulfill({ response: await r.fetch({ url: r.request().url().replace('http://localhost:5173', APP) }) }));
const DOCS = FORMS.filter((x) => !x.onFile);
for (const p of ['local-network-access', 'local-network', 'loopback-network']) { try { await ctx.grantPermissions([p], { origin: 'https://tcooc-co.gov.taipei' }); } catch {} }
const page = ctx.pages()[0] ?? await ctx.newPage();
const T0 = Date.now(), fast = []; // spans of real waiting that post-processing speeds up
const wait = (ms) => page.waitForTimeout(ms);
const caption = (text) => page.evaluate((t) => {
  let el = document.getElementById('zf-cap');
  if (!el) { el = document.createElement('div'); el.id = 'zf-cap'; el.style.cssText = 'position:fixed;left:24px;bottom:24px;z-index:2147483647;max-width:420px;background:#0E1116;color:#fff;font:600 17px/1.4 Inter,system-ui,sans-serif;padding:14px 18px;border-radius:12px;box-shadow:0 10px 30px #0006'; document.documentElement.appendChild(el); }
  el.textContent = t;
}, text);
const app = async () => { for (let i = 0; i < 50; i++) { const f = page.frames().find((x) => x.url().startsWith(APP) || x.url().startsWith('http://localhost:5173')); if (f) { await f.waitForSelector('main section'); return f; } await wait(200); } throw new Error('drawer frame not found'); };
const openDrawer = async (cap) => {
  await page.goto(GOV, { waitUntil: 'domcontentloaded' }); await wait(1500);
  await page.locator('button.start').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -120));
  await caption(cap); await wait(3000);
  await page.click('button.start'); await wait(1200);
  return app();
};
const answer = async (f, text, pause = 1400) => { await f.fill('#qi', ''); await f.type('#qi', text, { delay: 70 }); await wait(pause); await f.press('#qi', 'Enter'); await wait(1000); };
// Signing runs the native engine (Rust + Typst + Poppler), which takes ~15 s: wait for the result screen, never a fixed sleep.
const signAndWait = async (f, cap) => {
  await f.click('[data-go="sign"]'); await f.waitForSelector('.sms'); await wait(1500); await f.click('.sms');
  await caption(cap + ' (PDF generation is sped up ×10 in this video.)'); await wait(2500);
  const from = (Date.now() - T0) / 1000;
  await f.waitForSelector('.hash', { timeout: 300000 });
  fast.push([from, (Date.now() - T0) / 1000 - 0.3]); await wait(800);
};
const KINDS = ['capital_verification', 'address_approval', 'name_approval'];
const upload = async (f, kinds, cap) => {
  await f.locator(`#evidence-${kinds[0]}`).scrollIntoViewIfNeeded(); await caption(cap); await wait(1800);
  for (const kind of kinds) {
    const r = await fetch(`${APP}/api/mock-attachments/${kind}`);
    if (!r.ok) throw new Error(`mock evidence ${kind}: ${r.status}`);
    const file = path.join(TMP, `MOCK-${kind}-${Date.now()}.pdf`); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    await f.setInputFiles(`#evidence-${kind}`, file); await wait(600);
    await f.waitForFunction(() => !document.querySelector('input[data-upload]:disabled'), null, { timeout: 60000 });
    await f.locator(`#evidence-${kind}`).scrollIntoViewIfNeeded(); await wait(900);
  }
};
// Self-review calls Claude Haiku on each evidence PDF: wait for the report, speed the wait up in post.
const selfReview = async (f, cap) => {
  await f.click('[data-go="selfReview"]'); await caption(cap + ' (Sped up ×10.)');
  const from = (Date.now() - T0) / 1000;
  await f.waitForFunction(() => document.querySelector('.self-review') && !document.querySelector('[data-go="selfReview"]')?.disabled, null, { timeout: 240000 });
  fast.push([from, (Date.now() - T0) / 1000 - 0.3]);
  await f.locator('.self-review').scrollIntoViewIfNeeded(); await caption(cap); await wait(3500);
};
const officer = async () => { await page.goto(APP + '/officer.html'); await page.waitForSelector('[data-check]'); await wait(600); };
const scrollTo = (sel) => page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), sel);
const evidenceSection = 'section:has(.checks) ~ section:last-of-type';

// 0 · agency setup, done once per service: Claude reads the official forms
await page.goto(APP + '/setup.html'); await page.waitForSelector('[data-go="scan"]'); await wait(800);
await caption(`Set up once, by the agency: Claude reads all ${FORMS.length} official forms for registering a limited company in Taipei.`); await wait(3500);
await page.click('[data-go="scan"]');
await caption(`Claude reads the ${FORMS.length} official PDFs in parallel and marks every box the applicant has to fill. (Sped up ×10.)`);
{ const from = (Date.now() - T0) / 1000; await page.waitForSelector('.status .mono', { timeout: 120000 }); fast.push([from, (Date.now() - T0) / 1000 - 0.3]); }
await page.waitForSelector('[data-go="merge"]', { timeout: 60000 }); await wait(2500);
await caption('Every box on every form is found, with its real position on the official PDF.'); await wait(2500);
await page.click('[data-go="merge"]'); await caption('Boxes that ask for the same thing are merged: same colour, same fact.'); await wait(4500);
await page.click('[data-go="result"]'); await caption('Facts the applicant already verified are reused. Only what is new gets asked.'); await wait(4500);
await page.click('[data-go="publish"]'); await caption('An officer approves the mapping and publishes it to the button on the government site.'); await wait(3500);

// 1 · applicant on the real government page
await page.goto(GOV, { waitUntil: 'domcontentloaded' }); await wait(1000);
await caption('The real Taipei City page for registering a company: 7 separate forms to download and fill in by hand.'); await wait(3500);
let f = await openDrawer('Zero Form adds one button to the existing site. No new portal.');
await caption('Sign in with a one-time code sent to the phone number you already verified. (SMS is simulated.)'); await wait(2800);
await f.click('[data-go="login"]'); await wait(1500); await f.click('.sms');
await f.waitForSelector('[data-go="confirmKnown"]'); await wait(600);
await caption('Zero refill: facts you already verified are reused, each with its source.'); await wait(4000);
await f.click('[data-go="confirmKnown"]'); await wait(1200);
await caption('Only the 3 missing facts are asked, one per screen. Every form fills live as you type.');
await answer(f, '臺北市大安區復興南路一段 390 號 5 樓');
await answer(f, '1000000');
await answer(f, '林美華');
await caption('Check once. Then attach the supporting evidence the city asks for.'); await wait(3000);
await upload(f, KINDS, 'Supporting evidence: marked demo PDFs for the capital audit, address approval and name approval.');
await selfReview(f, 'Self-review: Claude Haiku reads each evidence PDF and checks it against your answers before you sign.');
await caption('Every check passes. Signing locks this exact version by its SHA-256 fingerprint.'); await wait(3000);
await signAndWait(f, `The text code confirms that fingerprint. The server seals it with Ed25519, then the native engine renders and verifies ${DOCS.length} PDFs.`);
await caption(`Submitted: ${DOCS.length} official PDFs generated from one signed snapshot.`); await wait(3000);
await f.locator('.docs').scrollIntoViewIfNeeded(); await wait(2500);

// 2 · officer: live checks, one-field change request
await officer();
await caption('Officer console: the server computes 5 checks live, including hash, signature and the text in every PDF.'); await wait(4500);
await scrollTo(evidenceSection); await wait(1500);
await caption('Each evidence PDF is compared with the signed facts.'); await wait(3500);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await wait(1000);
await page.click('tr[data-k="company.capital"]'); await wait(800);
await caption('The officer asks for a fix to one field, not the whole application.');
await page.type('#note', 'Bank deposit proof shows NT$ 800,000. Please correct the capital.', { delay: 22 }); await wait(800);
await page.click('#revise'); await wait(2500);

// 3 · applicant fixes only that field; self-review catches the stale evidence; re-sign v2
f = await openDrawer('Back on the government page, the applicant sees exactly what to fix.');
await f.waitForSelector('[data-go="fix"]'); await wait(2500); await f.click('[data-go="fix"]'); await wait(1000);
await caption('Everything else stays locked. Only the capital field reopens.');
await answer(f, '800000');
await wait(1200);
await selfReview(f, 'Self-review again: the old capital proof still says NT$ 1,000,000, so it is flagged before anything is sent.');
await upload(f, ['capital_verification'], 'Attach updated capital proof for NT$ 800,000.');
await selfReview(f, 'Re-check with the new proof.');
await signAndWait(f, 'Re-signing creates version 2, linked to version 1. New PDFs are generated.');
await caption('Version 2 signed.'); await wait(2500);

// 4 · officer reviews v2 + evidence, approves
await officer();
await caption('Version 2 replaces version 1. One field changed and all 5 checks pass.'); await wait(4000);
await scrollTo(evidenceSection); await wait(1500);
await caption('Each evidence PDF is read and compared with the signed facts: company name, capital, address and dates.'); await wait(5000);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await wait(1000);
await caption('Everything matches, so Approve is enabled.'); await wait(2000);
await page.click('#approve'); await wait(2500);
f = await openDrawer('The applicant sees the decision on the same page.');
await f.waitForSelector('.badge.ok'); await wait(3500);

// 5 · every generated official PDF, page 1 each (rasterised with Poppler; headless Chromium has no PDF viewer)
const raster = async (id, dpi) => {
  const file = path.join(TMP, `${id}-v2.pdf`);
  fs.writeFileSync(file, Buffer.from(await (await fetch(`${APP}/doc/2/${id}`)).arrayBuffer()));
  execFileSync(process.env.ZERO_FORM_PDFTOPPM || 'pdftoppm', ['-png', '-r', String(dpi), '-f', '1', '-l', '1', '-singlefile', file, file.slice(0, -4)]);
  return 'data:image/png;base64,' + fs.readFileSync(file.slice(0, -4) + '.png').toString('base64');
};
const thumbs = await Promise.all(DOCS.map(async (d) => ({ ...d, png: await raster(d.id, 70) })));
await page.goto('about:blank');
await page.setContent(`<body style="margin:0;background:#E8EAEE;font:600 13px Inter,system-ui,sans-serif;color:#0E1116;height:100vh;display:flex;flex-direction:column;align-items:center;padding-top:34px;box-sizing:border-box">
  <div style="display:grid;grid-template-columns:repeat(${Math.ceil(thumbs.length / 2)},226px);gap:16px 18px">${thumbs.map((t) => `<figure style="margin:0;display:flex;flex-direction:column;gap:6px">
    <img src="${t.png}" style="width:226px;height:320px;object-fit:cover;object-position:top;background:#fff;box-shadow:0 3px 14px #0002">
    <figcaption>${t.name}<br><span style="font-weight:500;color:#4A5160">${t.en} · /doc/2/${t.id}</span></figcaption></figure>`).join('')}</div></body>`);
await caption(`${DOCS.length} official forms generated from one signed snapshot: confirmed values written onto the real GCIS forms.`); await wait(6500);

// 5b · one generated PDF up close
const pdf = path.join(TMP, 't70126.pdf');
fs.writeFileSync(pdf, Buffer.from(await (await fetch(APP + '/doc/2/t70126')).arrayBuffer()));
execFileSync(process.env.ZERO_FORM_PDFTOPPM || 'pdftoppm', ['-png', '-r', '150', '-singlefile', pdf, path.join(TMP, 't70126')]);
const png = 'data:image/png;base64,' + fs.readFileSync(path.join(TMP, 't70126.png')).toString('base64');
await page.goto('about:blank');
await page.setContent(`<body style="margin:0;background:#E8EAEE;display:flex;gap:28px;align-items:center;justify-content:center;height:100vh;font:600 15px Inter,system-ui,sans-serif;color:#0E1116">
  <img src="${png}" style="height:840px;box-shadow:0 4px 24px #0003;background:#fff">
  <div style="display:flex;flex-direction:column;gap:12px;width:760px"><div>/doc/2/t70126 · 章程 (Articles of incorporation) · footer, zoomed in</div>
  <div style="width:760px;height:64px;overflow:hidden;background:#fff;box-shadow:0 4px 24px #0003;position:relative"><img src="${png}" style="position:absolute;width:1240px;left:-240px;bottom:0"></div>
  <div id="pdfcap" style="margin-top:28px;background:#0E1116;color:#fff;font:600 17px/1.4 Inter,system-ui,sans-serif;padding:14px 18px;border-radius:12px;box-shadow:0 10px 30px #0006">A generated PDF: the confirmed values written onto the official GCIS form, with the snapshot hash in the footer.</div></div></body>`);
await wait(5500);

// 6 · tamper
await officer();
await caption('What if someone alters the stored data after signing?'); await wait(2500);
await page.click('#tamper'); await page.waitForSelector('.check.bad'); await wait(800);
await caption('Identity, integrity and consistency turn red: the signed PDFs no longer match the stored data.'); await wait(5500);

const video = page.video();
await ctx.close();
const src = await video.path(), dest = path.join(OUT, 'zero-form-all-forms.webm');
// Speed up the PDF-generation waits ×10 and encode VP9 (much smaller than Playwright's VP8). Falls back to the raw file without ffmpeg.
try {
  const cuts = [0, ...fast.flat(), 1e6], parts = [];
  for (let i = 0; i < cuts.length - 1; i++) parts.push(`[0:v]trim=${cuts[i]}:${cuts[i + 1]},setpts=(PTS-STARTPTS)${i % 2 ? '/10' : ''}[p${i}]`);
  const graph = parts.join(';') + ';' + parts.map((_, i) => `[p${i}]`).join('') + `concat=n=${parts.length}:v=1[out]`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-filter_complex', graph, '-map', '[out]', '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-row-mt', '1', '-cpu-used', '4', dest]);
} catch (e) { console.warn('ffmpeg post-processing skipped:', e.message); fs.copyFileSync(src, dest); }
console.log('saved', dest);
await post('/api/demo/reset');
