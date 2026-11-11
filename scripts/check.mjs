// Feature check: walks GOAL.md criteria 3–10 through the API. Prints PASS/FAIL per feature.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 5193, BASE = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zf-check-'));
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, DATA_DIR }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));

const call = async (p, body) => {
  const r = await fetch(BASE + p, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text();
  try { return { status: r.status, ...JSON.parse(t) }; } catch { return { status: r.status, text: t }; }
};
let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); if (!ok) fails++; };
const sign = async () => { const s = await call('/api/sign/send', {}); return { hash: s.hash, st: await call('/api/sign/verify', { code: s.demoCode }) }; };
const ANSWERS = { 'company.address': '臺北市大安區復興南路一段 390 號 5 樓', 'company.capital': '1000000', 'director2.name': '吳小明', 'director2.nationalId': 'F123456784', 'owner.name': '林美華' };

try {
  const sent = await call('/api/login/send', {});
  let st = await call('/api/login/verify', { code: sent.demoCode });
  check('2  two-step: code to known phone', sent.to?.includes('•••') && st.app?.status === 'draft', sent.to);

  const known = ['person.name', 'person.nationalId', 'person.phone', 'person.address', 'company.name', 'company.items'];
  check('3  zero refill: known facts prefilled with source', known.every((k) => st.app.draft[k]?.value && st.app.draft[k]?.source));
  check('4  ask once: only missing fields asked', JSON.stringify([...st.app.missing].sort()) === JSON.stringify(Object.keys(ANSWERS).sort()), st.app.missing.join(', '));
  const bad = await call('/api/answer', { values: { 'director2.nationalId': 'A123456788' } });
  check('4  national ID checksum rejected', bad.status === 422);

  const agent = await call('/api/agent/draft', { values: { 'company.capital': '1000000' } });
  const early = await call('/api/sign/verify', { code: '123456' });
  check('10 agent API drafts, cannot sign', !Object.keys(agent.errors || {}).length && early.status === 400);
  st = await call('/api/answer', { values: ANSWERS });

  const v1 = await sign();
  check('5  sign once: snapshot v1 sealed', v1.st.app?.status === 'submitted' && v1.st.app.snapshot.hash === v1.hash, v1.hash?.slice(0, 16));

  const doc = await call('/doc/1/t70132');
  check('6  every form generated from snapshot', doc.status === 200 && doc.text.includes(v1.hash) && doc.text.includes('吳小明'));

  let off = await call('/api/officer');
  check('7  officer: 5 checks all green', off.verify?.checks.length === 5 && off.verify.checks.every((c) => c.ok), off.verify?.checks.map((c) => c.key + ':' + c.ok).join(' '));
  check('7  officer: docs consistent', off.verify.docs.every((d) => d.ok), `${off.verify.docs.length} docs`);
  check('7  officer page served', (await call('/officer.html')).status === 200);

  await call('/api/officer/decide', { decision: 'revise', field: 'company.capital', note: 'Bank proof shows 800,000' });
  st = await call('/api/state');
  check('9  revision reopens only that field', st.app.status === 'revision' && st.app.reopen === 'company.capital');
  await call('/api/answer', { values: { 'company.capital': '800000' } });
  const v2 = await sign();
  off = await call('/api/officer');
  check('9  re-sign creates v2 linked to v1', off.app.v === 2 && off.app.prev === v1.hash && off.verify.checks.every((c) => c.ok));
  await call('/api/officer/decide', { decision: 'approve' });
  check('9  approve reaches applicant', (await call('/api/state')).app.status === 'approved');

  await call('/api/demo/tamper', {});
  off = await call('/api/officer');
  const by = Object.fromEntries(off.verify.checks.map((c) => [c.key, c.ok]));
  check('8  tamper turns integrity + consistency red', !by.integrity && !by.consistency, JSON.stringify(by));

  const next = await call('/api/login/send', {});
  st = await call('/api/login/verify', { code: next.demoCode });
  check('3  next application: 0 questions (zero refill)', st.app.missing.length === 0, `missing=${st.app.missing.length}`);
} catch (e) { check('run', false, e.stack); }
finally { srv.kill(); fs.rmSync(DATA_DIR, { recursive: true, force: true }); }
console.log(fails ? `\n${fails} FAILED` : '\nALL FEATURES PASS');
process.exit(fails ? 1 : 0);
