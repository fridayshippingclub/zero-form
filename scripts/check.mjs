// Feature check: walks GOAL.md criteria 2–10 through the API against the native PDF engine. Prints PASS/FAIL per feature.
// Needs the engine toolchain (target/debug/zero-form, typst, pdftotext, python3 + reportlab). Signing takes ~15 s per snapshot.
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FORMS } from '../public/schema.js';

const PORT = 5193, BASE = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zf-check-'));
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, DATA_DIR }, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }

const call = async (p, body) => {
  const r = await fetch(BASE + p, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text();
  try { return { status: r.status, ...JSON.parse(t) }; } catch { return { status: r.status, text: t }; }
};
const bytes = async (p) => { const r = await fetch(BASE + p); return { status: r.status, type: r.headers.get('content-type'), buf: Buffer.from(await r.arrayBuffer()) }; };
const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',')}}` : JSON.stringify(v);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const pdfText = (buf) => { const f = path.join(DATA_DIR, 'probe.pdf'); fs.writeFileSync(f, buf); return execFileSync(process.env.ZERO_FORM_PDFTOTEXT || 'pdftotext', ['-enc', 'UTF-8', f, '-'], { encoding: 'utf8' }); };

let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); if (!ok) fails++; };
const sign = async () => { const s = await call('/api/sign/send', {}); const t = Date.now(); const st = await call('/api/sign/verify', { code: s.demoCode }); return { hash: s.hash, st, secs: ((Date.now() - t) / 1000).toFixed(1) }; };
const attach = async (kind) => {
  const pdf = await bytes(`/api/mock-attachments/${kind}`);
  const r = await fetch(`${BASE}/api/attachments?kind=${kind}`, { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: pdf.buf });
  return { status: r.status, ...(await r.json()) };
};
const KINDS = ['capital_verification', 'address_approval', 'name_approval'];
const ANSWERS = { 'company.address': '臺北市大安區復興南路一段 390 號 5 樓', 'company.capital': '1000000', 'owner.name': '林美華' };
const DOCS = FORMS.filter((f) => !f.onFile);

try {
  const sent = await call('/api/login/send', {});
  let st = await call('/api/login/verify', { code: sent.demoCode });
  check('2  two-step: code to known phone', sent.to?.includes('•••') && /^\d{6}$/.test(sent.demoCode) && st.app?.status === 'draft', sent.to);

  const known = ['person.name', 'person.nationalId', 'person.phone', 'person.address', 'company.name', 'company.items', 'company.articles_date'];
  check('3  zero refill: known facts prefilled with source', known.every((k) => st.app.draft[k]?.value && st.app.draft[k]?.source && st.app.draft[k]?.verified));
  check('4  ask once: only missing fields asked', JSON.stringify([...st.app.missing].sort()) === JSON.stringify(Object.keys(ANSWERS).sort()), st.app.missing.join(', '));
  check('4  one fact → many forms', FORMS.length === 7 && FORMS.filter((f) => f.fields.includes('company.address')).length >= 4, `${FORMS.length} forms; address in ${FORMS.filter((f) => f.fields.includes('company.address')).length}`);
  const bad = await call('/api/answer', { values: { 'person.nationalId': 'A123456788' } });
  check('4  national ID checksum rejected', bad.status === 422 && !!bad.errors?.['person.nationalId'], bad.errors?.['person.nationalId']);

  const agent = await call('/api/agent/draft', { values: { 'company.capital': '1000000' } });
  const schema = await call('/api/agent/schema');
  const early = await call('/api/sign/verify', { code: '123456' });
  check('10 agent API drafts, cannot sign', !Object.keys(agent.errors || {}).length && !agent.missing.includes('company.capital') && schema.forms?.length === 7 && early.status === 400);
  st = await call('/api/answer', { values: ANSWERS });

  const v1 = await sign();
  const pkg1 = await call('/api/package/1');
  const sigOk = pkg1.serverSig && crypto.verify(null, Buffer.from(canonical({ hash: pkg1.hash, confirmation: pkg1.confirmation })), pkg1.serverPublicKey, Buffer.from(pkg1.serverSig, 'base64'));
  check('5  sign once: snapshot v1 sealed (SMS code bound to SHA-256, Ed25519)', v1.st.app?.status === 'submitted' && v1.st.app.snapshot.hash === v1.hash && pkg1.confirmation?.hash === v1.hash && sigOk, v1.st.error ? `${v1.st.status} ${v1.st.error} ${v1.st.detail || ''}` : `${v1.hash?.slice(0, 16)} · signed + 6 PDFs in ${v1.secs}s`);

  const pdfs = await Promise.all(DOCS.map(async (f) => ({ f, r: await bytes(`/doc/1/${f.id}`) })));
  const pdfOk = pdfs.filter(({ f, r }) => r.status === 200 && r.type?.includes('pdf') && r.buf.subarray(0, 5).toString() === '%PDF-' && sha(r.buf) === pkg1.docs?.[f.id]);
  check('6  every form generated as native PDF, digest sealed', pdfOk.length === DOCS.length && DOCS.length === 6, `${pdfOk.length} of ${DOCS.length} PDFs`);
  const art = pdfText(pdfs.find(({ f }) => f.id === 't70126').r.buf).replace(/\s+/g, '');
  check('6  PDF shows the snapshot values + snapshot hash', art.includes(v1.hash) && art.includes(ANSWERS['company.address'].replace(/\s+/g, '')));

  let off = await call('/api/officer');
  check('7  officer: 5 checks all green', off.verify?.checks.length === 5 && off.verify.checks.every((c) => c.ok), off.verify?.checks.map((c) => c.key + ':' + c.ok).join(' '));
  check('7  officer: docs consistent', off.verify.docs.length === 6 && off.verify.docs.every((d) => d.ok), `${off.verify.docs.filter((d) => d.ok).length} of ${off.verify.docs.length} docs`);
  check('7  officer page served', (await bytes('/officer.html')).status === 200);
  const blocked = await call('/api/officer/decide', { decision: 'approve' });
  check('7  approval blocked until evidence passes', off.verify.externalReview.recommendation === 'request_documents' && blocked.status === 409, off.verify.externalReview.recommendation);
  const uploads = [];
  for (const k of KINDS) uploads.push(await attach(k));
  off = await call('/api/officer');
  check('7  evidence PDFs uploaded and cross-checked', uploads.every((u) => u.status === 201) && off.verify.externalReview.recommendation === 'approve',
    `${off.verify.externalReview.checks.filter((c) => c.status === 'passed').length}/${off.verify.externalReview.checks.length} evidence checks passed`);

  await call('/api/officer/decide', { decision: 'revise', field: 'company.capital', note: 'Bank proof shows 800,000' });
  st = await call('/api/state');
  check('9  revision reopens only that field', st.app.status === 'revision' && st.app.reopen === 'company.capital' && JSON.stringify(st.app.missing) === '["company.capital"]');
  await call('/api/answer', { values: { 'company.capital': '800000' } });
  const v2 = await sign();
  off = await call('/api/officer');
  check('9  re-sign creates v2 linked to v1', off.app.v === 2 && off.app.prev === v1.hash && off.app.hash === v2.hash && off.verify.checks.every((c) => c.ok), v2.st.error || `re-signed in ${v2.secs}s`);
  const stale = off.verify.externalReview.checks.find((c) => c.kind === 'capital_verification' && c.field === 'Capital-TWD');
  check('9  old capital evidence flagged against v2', off.verify.externalReview.recommendation !== 'approve' && stale?.status === 'mismatch', `${stale?.expected} vs ${stale?.actual}`);
  const reup = await attach('capital_verification');
  off = await call('/api/officer');
  check('9  new capital evidence passes', reup.status === 201 && off.verify.externalReview.recommendation === 'approve');
  const ok = await call('/api/officer/decide', { decision: 'approve' });
  check('9  approve reaches applicant', ok.status === 200 && (await call('/api/state')).app.status === 'approved');

  await call('/api/demo/tamper', {});
  off = await call('/api/officer');
  const by = Object.fromEntries(off.verify.checks.map((c) => [c.key, c.ok]));
  check('8  tamper turns integrity + consistency red', !by.integrity && !by.consistency, JSON.stringify(by) + ` · ${off.verify.docs.filter((d) => !d.ok).length} docs mismatch`);
  check('8  tampered package cannot be approved', (await call('/api/officer/decide', { decision: 'approve' })).status === 409);

  const next = await call('/api/login/send', {});
  st = await call('/api/login/verify', { code: next.demoCode });
  check('3  next application: 0 questions (zero refill)', st.app.missing.length === 0, `missing=${st.app.missing.length}`);
} catch (e) { check('run', false, e.stack); }
finally { srv.kill(); fs.rmSync(DATA_DIR, { recursive: true, force: true }); }
console.log(fails ? `\n${fails} FAILED` : '\nALL FEATURES PASS');
process.exit(fails ? 1 : 0);
