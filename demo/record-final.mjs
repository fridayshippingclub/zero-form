// Final end-to-end recording: agency setup → real Taipei page + extension → applicant (SMS code, reuse, 3 questions,
// demo evidence, self-review, sign) → officer checks + one-field fix → v2 → approve → the 7 generated official PDFs
// up close → tamper. Needs the app on ZF_APP (default :5173; the extension's localhost:5173 iframe is routed there),
// the native engine, Poppler and ffmpeg.
// Output: demo/zero-form-final.{webm,mp4}, demo/zero-form-final-poster.png, demo/zero-form-final-preview.gif
import { chromium } from 'playwright';
import { FORMS } from '../public/schema.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.ZF_APP || 'http://localhost:5173', GOV = 'https://tcooc-co.gov.taipei/cp.aspx?n=1ddc8c221b97a1bd&s=5BA095ECA5D6FAB3';
const OUT = path.resolve('demo'), VID = fs.mkdtempSync(path.join(os.tmpdir(), 'zf-vid-')), TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'zf-files-'));
const PDFTOPPM = process.env.ZERO_FORM_PDFTOPPM || 'pdftoppm', PDFTOTEXT = process.env.ZERO_FORM_PDFTOTEXT || 'pdftotext';
const post = (p) => fetch(APP + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
await post('/api/demo/reset');

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'zf-prof-')), {
  channel: 'chromium', headless: !process.env.HEADED, viewport: { width: 1440, height: 900 },
  recordVideo: { dir: VID, size: { width: 1440, height: 900 } },
  args: [`--disable-extensions-except=${path.resolve('extension')}`, `--load-extension=${path.resolve('extension')}`],
});
if (!APP.startsWith('http://localhost:5173')) await ctx.route('http://localhost:5173/**', async (r) => r.fulfill({ response: await r.fetch({ url: r.request().url().replace('http://localhost:5173', APP) }) }));
const DOCS = FORMS.filter((x) => !x.onFile);
for (const p of ['local-network-access', 'local-network', 'loopback-network']) { try { await ctx.grantPermissions([p], { origin: 'https://tcooc-co.gov.taipei' }); } catch {} }
const page = ctx.pages()[0] ?? await ctx.newPage();
const T0 = Date.now(), fast = [], marks = {}; // fast: spans of real waiting sped up ×10; marks: raw times of key moments
const now = () => (Date.now() - T0) / 1000;
const mark = (k) => { marks[k] = now(); };
const wait = (ms) => page.waitForTimeout(ms);
const CAP_CSS = 'position:fixed;left:24px;bottom:24px;z-index:2147483647;max-width:560px;background:#0E1116;color:#fff;font:600 18px/1.4 "PingFang TC","Noto Sans TC",Inter,system-ui,sans-serif;padding:14px 18px;border-radius:12px;box-shadow:0 10px 30px #0006';
const caption = (zh, en) => page.evaluate(([zh, en, css]) => {
  let el = document.getElementById('zf-cap');
  if (!el) { el = document.createElement('div'); el.id = 'zf-cap'; el.style.cssText = css; document.documentElement.appendChild(el); }
  el.innerHTML = '';
  const a = document.createElement('div'); a.textContent = zh; el.appendChild(a);
  if (en) { const b = document.createElement('div'); b.textContent = en; b.style.cssText = 'font-weight:500;font-size:15px;color:#C9CED8;margin-top:3px'; el.appendChild(b); }
}, [zh, en, CAP_CSS]);
const spedUp = () => page.evaluate(() => { const el = document.getElementById('zf-cap'); if (el && !el.textContent.includes('×10')) { const s = document.createElement('div'); s.textContent = '（等待時間加速 ×10 · real wait sped up ×10）'; s.style.cssText = 'font-weight:500;font-size:13px;color:#8FA2FF;margin-top:4px'; el.appendChild(s); } });
const fastUntil = async (from, promise) => { await promise; fast.push([from, now() - 0.3]); };
const app = async () => { for (let i = 0; i < 60; i++) { const f = page.frames().find((x) => x.url().startsWith(APP) || x.url().startsWith('http://localhost:5173')); if (f) { await f.waitForSelector('main section'); return f; } await wait(200); } throw new Error('drawer frame not found'); };
const openDrawer = async (zh, en, hold = 2500) => {
  await page.goto(GOV, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#zero-form-hero', { timeout: 30000 }); await wait(800);
  await page.evaluate(() => document.getElementById('zero-form-hero').scrollIntoView({ block: 'center' }));
  await caption(zh, en); await wait(hold);
  await page.click('#zero-form-hero button.go'); await wait(1200);
  return app();
};
const answer = async (f, text, pause = 1600) => { await f.fill('#qi', ''); await f.type('#qi', text, { delay: 60 }); await wait(pause); await f.press('#qi', 'Enter'); await wait(900); };
const uploadEvidence = async (f, kind) => {
  const r = await fetch(`${APP}/api/mock-attachments/${kind}`);
  if (!r.ok) throw new Error(`mock evidence ${kind}: ${r.status}`);
  const file = path.join(TMP, `MOCK-${kind}.pdf`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  await f.locator(`#evidence-${kind}`).scrollIntoViewIfNeeded().catch(() => {});
  const uploaded = page.waitForResponse((res) => res.url().endsWith(`/api/attachments?kind=${kind}`) && res.request().method() === 'POST', { timeout: 30000 });
  await f.setInputFiles(`#evidence-${kind}`, file);
  if (!(await uploaded).ok()) throw new Error(`upload evidence ${kind}`);
  await f.waitForFunction(() => !document.querySelector('input[data-upload]:disabled'), undefined, { timeout: 30000 });
};
const selfReview = async (f) => {
  await f.click('[data-go="selfReview"]'); await wait(1200); await spedUp();
  const from = now();
  await fastUntil(from, f.waitForSelector('[data-go="sign"]:not([disabled])', { timeout: 180000 }));
  await f.locator('.self-review').scrollIntoViewIfNeeded(); await wait(2800);
};
const signAndWait = async (f) => {
  await f.click('[data-go="sign"]'); await f.waitForSelector('[data-go="fillCode"]'); await wait(1300);
  await f.click('[data-go="fillCode"]');
  await f.waitForSelector('.stepper'); await wait(3500); await spedUp();
  const from = now();
  await fastUntil(from, f.waitForSelector('.hash', { timeout: 300000 })); await wait(600);
};
const officer = async () => { await page.goto(APP + '/officer.html'); await page.waitForSelector('[data-check]'); await wait(600); };
const scrollTo = (sel) => page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), sel);
const evidenceSection = 'section:has(.checks) ~ section:last-of-type';

// ───────── 1 · agency setup (Live: Claude reads the official PDFs) ─────────
mark('setup');
await page.goto(APP + '/setup.html'); await page.waitForSelector('[data-go="scan"]'); await wait(600);
await caption(`機關端，只需設定一次：Claude 讀取 ${FORMS.length} 份官方 PDF`, `Agency setup, done once: Claude reads the ${FORMS.length} official PDFs for registering a company.`); await wait(3000);
await page.click('[data-go="scan"]'); await wait(800); await spedUp();
await fastUntil(now(), page.waitForSelector('[data-go="merge"]', { timeout: 180000 }));
await caption('每一個需要填寫的欄位都被標出，位置對應官方 PDF', 'Every box the applicant must fill is found and highlighted at its real position on the PDF.'); await wait(3500);
await page.click('[data-go="merge"]'); await wait(300);
const counts = (await page.textContent('h1')).match(/(\d+) fields, but only (\d+)/) || [0, '45', '11'];
await caption('問同一件事的欄位合併：同色＝同一項事實', 'Boxes asking for the same thing are merged: same colour = same fact.'); await wait(3500);
await page.click('[data-go="result"]'); await caption(`${counts[1]} 個欄位 → ${counts[2]} 項事實 → 申請人只需輸入 3 項`, `${counts[1]} fields → ${counts[2]} facts → only 3 for the applicant to type (the rest are already verified).`); await wait(4000);
await page.click('[data-go="publish"]'); await caption('審核後發布到政府網站上的按鈕', 'An officer approves the mapping and publishes it to the government site.'); await wait(2800);

// ───────── 2 · the real Taipei page + extension ─────────
mark('gov');
let f = await openDrawer('真實的臺北市公司設立登記頁面：標題下方多了一則雙語服務通知', 'The real Taipei City registration page. The extension adds one bilingual service notice under the title.', 4000);
// ───────── 3 · applicant ─────────
mark('applicant');
await caption('以簡訊驗證碼登入（模擬）：點一下通知即可填入', 'Sign in with an SMS code (simulated): tap the notification to fill it.'); await wait(1600);
await f.click('[data-go="login"]'); await f.waitForSelector('[data-go="fillCode"]'); await wait(1600);
await f.click('[data-go="fillCode"]');
await f.waitForSelector('[data-go="confirmKnown"]'); await wait(600);
await caption('零重填：已驗證的資料直接沿用，並標示來源', 'Zero refill: facts already verified are reused, each with its source.'); await wait(3500);
await f.click('[data-go="confirmKnown"]'); await wait(1000);
await caption('只問 3 題；右側表單預覽隨輸入即時填入', 'Only 3 questions. The live preview of every form fills as you type.');
await answer(f, '臺北市大安區復興南路一段 390 號 5 樓', 2200);
await answer(f, '1000000');
await answer(f, '林美華');
await caption('一鍵載入展示用佐證 PDF：驗資、地址預查、名稱預查', 'Load demo PDFs: capital audit, address precheck, name reservation (marked samples).'); await wait(1800);
await f.click('[data-go="loadDemoEvidence"]');
await f.waitForSelector('[data-go="selfReview"]:not([disabled])', { timeout: 60000 }); await wait(1500);
await caption('送出前自我核對（Claude Haiku）：比對佐證文件與答案', 'Self-review before signing (Claude Haiku): evidence vs. answers. Signing stays blocked until it passes.');
await selfReview(f);
await caption('核對通過。以簡訊碼確認，綁定此版本的 SHA-256 指紋', 'Review passed. Confirm with a code bound to this version’s SHA-256 fingerprint.'); await wait(1500);
mark('sign');
await signAndWait(f);
await caption(`已送出：由同一份簽署快照產生 ${DOCS.length} 份官方 PDF`, `Submitted: ${DOCS.length} official PDFs generated from one signed snapshot (Ed25519-sealed).`);
await f.locator('.docs').scrollIntoViewIfNeeded(); await wait(3200);

// ───────── 4 · officer: checks, one-field fix, v2, approve ─────────
mark('officer');
await officer();
await caption('審查端：伺服器即時計算 5 項檢查＋佐證比對', 'Officer console: 5 live checks (hash, signature, PDF text…) plus evidence.'); await wait(3800);
await scrollTo(evidenceSection); await wait(3000);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await wait(900);
await page.click('tr[data-k="company.capital"]'); await wait(600);
await caption('只要求修正一個欄位：資本額', 'The officer requests a fix to one field only: capital.');
await page.type('#note', '存款證明為 NT$ 800,000，請更正資本額。', { delay: 30 }); await wait(700);
await page.click('#revise'); await wait(2000);

mark('fix');
f = await openDrawer('申請人回到同一頁面，看到要修正的項目', 'Back on the same page, the applicant sees exactly what to fix.', 1800);
await f.waitForSelector('[data-go="fix"]'); await wait(2200); await f.click('[data-go="fix"]'); await wait(800);
await caption('其餘資料鎖定，只重新開放資本額', 'Everything else stays locked. Only capital reopens.');
await answer(f, '800000', 1300);
await caption('重新上傳相符的驗資證明，再次自我核對', 'Re-upload a matching capital report and run self-review again.'); await wait(1200);
await uploadEvidence(f, 'capital_verification'); await wait(1000);
await selfReview(f);
await caption('重新簽署產生第 2 版，連結第 1 版', 'Re-signing creates version 2, linked to version 1.');
await signAndWait(f); await wait(1500);

await officer();
await caption('第 2 版：只改了一個欄位，5 項檢查全數通過', 'Version 2: one field changed, all 5 checks pass.'); await wait(3200);
await caption('一切相符，核准', 'Everything matches. Approve.'); await wait(1200);
await page.click('#approve'); await wait(2200);

// ───────── 5 · THE FINAL PDFs ─────────
const st = await (await fetch(APP + '/api/state')).json();
const V = st.app.snapshot.v, HASH = st.app.snapshot.hash;
const PDFDIR = path.join(TMP, 'pdf'); fs.mkdirSync(PDFDIR);
const fetchPdf = async (id) => { const file = path.join(PDFDIR, `${id}.pdf`); fs.writeFileSync(file, Buffer.from(await (await fetch(`${APP}/doc/${V}/${id}`)).arrayBuffer())); return file; };
const files = Object.fromEntries(await Promise.all(DOCS.map(async (d) => [d.id, await fetchPdf(d.id)])));
if (process.env.ZF_KEEP_PDFS) for (const [id, file] of Object.entries(files)) fs.copyFileSync(file, path.join(process.env.ZF_KEEP_PDFS, `${id}.pdf`));
const rasterPage = (id, pg, dpi) => { const base = path.join(PDFDIR, `${id}-p${pg}-${dpi}`); execFileSync(PDFTOPPM, ['-png', '-r', String(dpi), '-f', String(pg), '-l', String(pg), '-singlefile', files[id], base]); return 'data:image/png;base64,' + fs.readFileSync(base + '.png').toString('base64'); };
// Word boxes from the PDF text layer, to find where the filled values sit.
const words = (id) => {
  const out = path.join(PDFDIR, `${id}.bbox.html`); execFileSync(PDFTOTEXT, ['-bbox-layout', files[id], out]);
  const html = fs.readFileSync(out, 'utf8'), pages = [];
  for (const pm of html.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)) {
    const lines = [...pm[3].matchAll(/<line[^>]*>([\s\S]*?)<\/line>/g)].map((lm) => [...lm[1].matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map((w) => ({ x0: +w[1], y0: +w[2], x1: +w[3], y1: +w[4], t: w[5] })));
    pages.push({ w: +pm[1], h: +pm[2], lines });
  }
  return pages;
};
const find = (pg, token) => {
  const hits = [];
  for (const ws of pg.lines) for (let i = 0; i < ws.length; i++) {
    let s = '';
    for (let j = i; j < ws.length && j < i + 12; j++) { s += ws[j].t; if (s.replace(/\s/g, '').includes(token)) { let a = i; while (a < j && ws.slice(a + 1, j + 1).map((w) => w.t).join('').includes(token)) a++; const g = ws.slice(a, j + 1); hits.push({ x0: Math.min(...g.map((w) => w.x0)), y0: Math.min(...g.map((w) => w.y0)), x1: Math.max(...g.map((w) => w.x1)), y1: Math.max(...g.map((w) => w.y1)) }); i = j; break; } }
  }
  return hits;
};
const TOK = { name: ['大大科技'], address: ['復興南路'], capital: ['800,000', '800000', '捌拾萬'], rep: ['陳大文'], owner: ['林美華'], hash: [HASH.slice(0, 10), 'sha256'] };
const hitsFor = (pg, keys) => keys.flatMap((k) => { for (const t of TOK[k]) { const h = find(pg, t); if (h.length) return h.map((b) => ({ ...b, k })); } return []; });

const contact = DOCS.map((d) => ({ ...d, png: rasterPage(d.id, 1, 110) }));
mark('pdfs');
await page.goto('about:blank');
await page.setContent(`<body style="margin:0;background:#E8EAEE;font:600 13px 'PingFang TC','Noto Sans TC',Inter,system-ui,sans-serif;color:#0E1116;height:100vh;display:flex;flex-direction:column;align-items:center;box-sizing:border-box;padding-top:22px">
  <div style="font-size:26px;font-weight:700;margin-bottom:4px">7 份官方表單 · 7 official forms generated from one signed snapshot</div>
  <div style="font-size:14px;font-weight:500;color:#4A5160;margin-bottom:18px">v${V} · sha256:${HASH.slice(0, 24)}… · rendered from <span style="font-family:ui-monospace,monospace">/doc/${V}/&lt;formId&gt;</span></div>
  <div style="display:grid;grid-template-columns:repeat(4,232px);gap:14px 22px">${contact.map((t, i) => `<figure style="margin:0;display:flex;flex-direction:column;gap:5px;opacity:0;transform:translateY(12px);transition:all .5s ${i * 0.18}s" class="th">
    <img src="${t.png}" style="width:232px;height:300px;object-fit:cover;object-position:top;background:#fff;box-shadow:0 3px 14px #0002">
    <figcaption>${t.name}<br><span style="font-weight:500;color:#4A5160">${t.en} · ${t.id}</span></figcaption></figure>`).join('')}</div></body>`);
await page.evaluate(() => requestAnimationFrame(() => document.querySelectorAll('.th').forEach((e) => { e.style.opacity = 1; e.style.transform = 'none'; })));
await wait(6500);

// Large view of one form: whole page, then slow zoom/pan onto the filled values and the hash footer.
const showForm = async (id, title, groups, forcePage) => {
  const pages = words(id);
  const score = (p) => hitsFor(p, ['name', 'address', 'capital', 'rep', 'owner']).length;
  const pi = forcePage ? forcePage - 1 : pages.map((p, i) => [score(p), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])[0][1];
  const pg = pages[pi], DPI = 200, k = DPI / 72, W = pg.w * k, H = pg.h * k;
  const all = hitsFor(pg, ['name', 'address', 'capital', 'rep', 'owner', 'hash']);
  const shots = groups.map(([keys, zh, en]) => {
    const hs = all.filter((h) => keys.includes(h.k)); if (!hs.length) return null;
    const b = { x0: Math.min(...hs.map((h) => h.x0)), y0: Math.min(...hs.map((h) => h.y0)), x1: Math.max(...hs.map((h) => h.x1)), y1: Math.max(...hs.map((h) => h.y1)) };
    return { b, zh, en };
  }).filter(Boolean);
  console.log(id, 'page', pi + 1, 'hits', all.map((h) => h.k).join(','), 'shots', shots.length);
  const png = rasterPage(id, pi + 1, DPI);
  await page.goto('about:blank');
  await page.setContent(`<body style="margin:0;background:#2A2F38;overflow:hidden;height:100vh;font-family:'PingFang TC','Noto Sans TC',Inter,system-ui,sans-serif">
    <div id="cam" style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0;transition:transform 2.4s cubic-bezier(.45,0,.2,1)">
      <img src="${png}" style="width:${W}px;height:${H}px;display:block;background:#fff;box-shadow:0 8px 40px #0008">
      ${all.map((h) => `<div class="hl" style="position:absolute;left:${h.x0 * k - 6}px;top:${h.y0 * k - 4}px;width:${(h.x1 - h.x0) * k + 12}px;height:${(h.y1 - h.y0) * k + 8}px;border:3px solid #2B50FF;border-radius:6px;background:#FFE06633;opacity:0;transition:opacity .6s"></div>`).join('')}
    </div>
    <div style="position:fixed;left:24px;top:20px;background:#0E1116E6;color:#fff;padding:10px 16px;border-radius:10px;font-size:20px;font-weight:700">${title}<div style="font-size:13px;font-weight:500;color:#C9CED8;margin-top:2px">/doc/${V}/${id} · page ${pi + 1} · v${V}</div></div>
    <div id="cap" style="position:fixed;left:24px;bottom:24px;max-width:640px;background:#0E1116;color:#fff;font-size:19px;font-weight:600;line-height:1.4;padding:14px 18px;border-radius:12px;box-shadow:0 10px 30px #0006"></div></body>`);
  const cam = (b, pad = 60) => page.evaluate(([b, W, H, pad]) => {
    const vw = innerWidth, vh = innerHeight; let s, x, y;
    if (!b) { s = (vh - 40) / H; x = (vw - W * s) / 2; y = 20; }
    else { const bw = b.x1 - b.x0 + pad * 2, bh = b.y1 - b.y0 + pad * 2; s = Math.min(1.5, (vw - 80) / bw, (vh - 220) / bh); x = vw / 2 - ((b.x0 + b.x1) / 2) * s; y = vh / 2 + 10 - ((b.y0 + b.y1) / 2) * s; }
    document.getElementById('cam').style.transform = `translate(${x}px,${y}px) scale(${s})`;
  }, [b && { x0: b.x0 * k, y0: b.y0 * k, x1: b.x1 * k, y1: b.y1 * k }, W, H, pad * k / 2]);
  const cap = (zh, en) => page.evaluate(([zh, en]) => { document.getElementById('cap').innerHTML = ''; const a = document.createElement('div'); a.textContent = zh; const b = document.createElement('div'); b.textContent = en; b.style.cssText = 'font-size:15px;font-weight:500;color:#C9CED8;margin-top:3px'; document.getElementById('cap').append(a, b); }, [zh, en]);
  await page.evaluate(() => { document.getElementById('cam').style.transition = 'none'; });
  await cam(null); await page.evaluate(() => { void document.body.offsetWidth; document.getElementById('cam').style.transition = ''; });
  await cap('完整頁面：已確認的資料直接寫入官方表單', 'Full page: the confirmed values written onto the official form.');
  await wait(1600);
  await page.evaluate(() => document.querySelectorAll('.hl').forEach((e) => { e.style.opacity = 1; }));
  await wait(1400);
  for (const s of shots) { await cap(s.zh, s.en); await cam(s.b); await wait(3800); }
  return { page: pi + 1, shots: shots.length };
};
const G = {
  all: [['name', 'address', 'capital', 'rep'], '公司名稱 大大科技・地址・資本額 800000（第 2 版修正後）・代表人 陳大文', 'Company name, address, capital NT$ 800,000 (the v2 correction) and representative, written into the original boxes.'],
  name: [['name'], '公司名稱：大大科技', 'Company name from the verified name reservation.'],
  rep: [['rep'], '申請人／代表人：陳大文', 'Applicant and representative, reused from the verified profile.'],
  nameRepAddr: [['name', 'rep', 'address'], '公司名稱・代表人・公司所在地', 'Company name, representative and registered address.'],
  capital: [['capital'], '第 6 條：資本總額 800000 元（第 2 版修正後）', 'Article 6: capital NT$ 800,000, the corrected value from v2.'],
  hash: [['hash'], '頁尾：簽署快照的 SHA-256 指紋', 'Footer: the signed snapshot’s SHA-256 hash ties every page to one version.'],
};
mark('t70135');
await showForm('t70135', '有限公司設立登記表 · Registration form (t70135)', [G.all, G.hash]);
await showForm('c00001', '名稱及所營事業預查申請表 · Name reservation (c00001)', [G.rep, G.name]);
await showForm('app', '公司設立登記申請書 · Application (app)', [G.nameRepAddr, G.hash]);
await showForm('t70126', '章程 · Articles of incorporation (t70126)', [G.name, G.capital], 1);

// ───────── 6 · tamper ─────────
mark('tamper');
await officer();
await caption('如果有人在簽署後竄改資料？', 'What if someone alters the stored data after signing?'); await wait(2200);
await page.click('#tamper'); await page.waitForSelector('.check.bad'); await wait(700);
await caption('身份確認、完整性與一致性立即轉紅：PDF 與資料不再相符', 'Identity, integrity and consistency turn red: the signed PDFs no longer match the stored data.'); await wait(5000);
mark('end');

const video = page.video();
await ctx.close();
const src = await video.path(), webm = path.join(OUT, 'zero-form-final.webm'), mp4 = path.join(OUT, 'zero-form-final.mp4');
const cuts = [0, ...fast.flat(), 1e6], parts = [];
for (let i = 0; i < cuts.length - 1; i++) parts.push(`[0:v]trim=${cuts[i]}:${cuts[i + 1]},setpts=(PTS-STARTPTS)${i % 2 ? '/10' : ''}[p${i}]`);
const graph = parts.join(';') + ';' + parts.map((_, i) => `[p${i}]`).join('') + `concat=n=${parts.length}:v=1[out]`;
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-filter_complex', graph, '-map', '[out]', '-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '0', '-row-mt', '1', '-cpu-used', '4', webm]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', webm, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
// raw → output time
const outT = (t) => { let o = t; for (const [a, b] of fast) o -= Math.max(0, Math.min(t, b) - a) * 0.9; return o; };
const M = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, +outT(v).toFixed(2)]));
fs.writeFileSync(path.join(TMP, 'marks.json'), JSON.stringify(M, null, 1));
console.log('marks', M);
console.log('saved', webm, mp4, 'tmp', TMP);
