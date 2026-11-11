import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const ROOT = process.cwd();
const ATTACHMENT_KINDS = ['capital_verification', 'address_approval', 'name_approval'];
let generating = false;
import { FIELDS, FORMS, ROLE_BINDINGS, formBindings, allFieldKeys, validate, docBody } from './public/schema.js';


const PORT = Number(process.env.PORT) || 5173;
const ORIGIN = `http://localhost:${PORT}`;
const DATA = process.env.DATA_DIR || './data';
const DB_FILE = `${DATA}/db.json`;

// ---------- domain ----------
// Fact: { value, source, verified, at }
// Application: { status: 'draft'|'submitted'|'revision'|'approved'|'rejected', draft: {key: Fact}, snapshots: [Snapshot], decision }
// Snapshot: { v, prev, data, provenance, hash, confirmation: {method, to, hash, at}, serverSig, docs: {formId: sha256}, signedAt }

const SEED_PROFILE = {
  'person.name': { value: '陳大文', source: 'MOI identity', verified: true },
  'person.nationalId': { value: 'A123456789', source: 'MOI identity', verified: true },
  'person.phone': { value: '0912-345-678', source: 'Verified by SMS', verified: true },
  'person.address': { value: '臺北市大安區仁愛路四段 1 號', source: 'Household registration', verified: true },
};
// Simulated external registries
const NAME_RESERVATIONS = { '113045678': { 'company.name': '大大科技', 'company.items': 'F119010 電子材料批發業、F113050 事務性機器設備批發業' } };
const HOUSEHOLD_REGISTRY = { A123456789: { name: '陳大文', address: '臺北市大安區仁愛路四段 1 號' } };

const fresh = () => ({ profile: structuredClone(SEED_PROFILE), app: null });
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : fresh();
const save = () => { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); };

let serverKey;
if (fs.existsSync(`${DATA}/server.key`)) serverKey = crypto.createPrivateKey(fs.readFileSync(`${DATA}/server.key`));
else { serverKey = crypto.generateKeyPairSync('ed25519').privateKey; fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(`${DATA}/server.key`, serverKey.export({ type: 'pkcs8', format: 'pem' })); }
const serverPub = crypto.createPublicKey(serverKey);

const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',')}}`
  : JSON.stringify(v);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest();
const b64u = (buf) => Buffer.from(buf).toString('base64url');

async function renderCore(body, hash) {
  const job = path.resolve(DATA, 'packages', crypto.randomUUID());
  fs.mkdirSync(job, { recursive: true });
  const input = path.join(job, 'input.json');
  fs.writeFileSync(input, JSON.stringify({ ...body, hash, forms: FORMS.filter(f => !f.onFile).map(f => ({ id: f.id, name: f.name, fields: formBindings(f) })) }));
  const { stdout } = await execute('python3', ['scripts/render-application.py', '--input', input, '--out', path.join(job, 'output')], { cwd: ROOT, timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
  const result = JSON.parse(stdout);
  for (const f of FORMS.filter(f => !f.onFile)) {
    const item = result.documents[f.id];
    if (!item) throw new Error('Core output missing ' + f.id);
    item.path = path.resolve(item.path);
    if (!fs.existsSync(item.path) || !fs.realpathSync(item.path).startsWith(fs.realpathSync(job) + path.sep)) throw new Error('Invalid core output path');
    if (sha256(fs.readFileSync(item.path)).toString('hex') !== item.sha256) throw new Error('Core PDF digest mismatch');
  }
  return result;
}
async function externalReview(snap) {
  const expected = { company_name: snap.data['company.name'], capital_twd: Number(String(snap.data['company.capital']).replaceAll(',', '')), address: snap.data['company.address'], application_date: snap.data['app.date'] };
  const payload = { attachments: db.app.attachments || {}, revision: db.app.evidenceRevision || 0, expected };
  const program = "import sys,json;sys.path.insert(0,'demo');from review import assess;x=json.loads(sys.argv[1]);print(json.dumps(assess(x['attachments'],x['revision'],x['expected'])))";
  const { stdout } = await execute('python3', ['-c', program, JSON.stringify(payload)], { cwd: ROOT, timeout: 15000 });
  return JSON.parse(stdout);
}

function newApp() {
  const draft = {};
  for (const [k, f] of Object.entries(db.profile)) draft[k] = { ...f };
  const res = NAME_RESERVATIONS['113045678'];
  for (const [k, value] of Object.entries(res)) draft[k] = { value, source: 'Name reservation 預查 #113045678', verified: true };
  draft['app.date'] = { value: new Date().toISOString().slice(0, 10), source: 'System', verified: true };
  return { id: 'TPE-2026-' + crypto.randomInt(100000, 999999), status: 'draft', draft, snapshots: [], decision: null, reopen: null };
}
const missing = (app) => allFieldKeys().filter((k) => !app.draft[k]?.value || (app.reopen && app.reopen === k));

function snapshotBody(app) {
  const data = {}, provenance = {};
  for (const k of allFieldKeys()) { data[k] = app.draft[k].value; provenance[k] = { source: app.draft[k].source, verified: !!app.draft[k].verified }; }
  const prev = app.snapshots.at(-1)?.hash ?? null;
  return { v: app.snapshots.length + 1, prev, schema: 'tw.company.ltd.incorporation@1', applicationId: app.id, data, provenance, roles: ROLE_BINDINGS };
}

// ---------- documents: one renderer, every form ----------

const docHash = (form, d) => sha256(docBody(form, d)).toString('hex');
const docHtml = (form, snap) => `<!doctype html><meta charset="utf-8"><title>${form.name}</title>
<style>body{font-family:"Noto Serif TC","PingFang TC",serif;background:#eee;margin:0;padding:32px}.page{background:#fff;max-width:720px;margin:auto;padding:64px;box-shadow:0 1px 4px #0002;min-height:900px;position:relative}
h1{text-align:center;font-size:26px;letter-spacing:4px;margin:0 0 32px}.s{line-height:2;font-size:16px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #333;padding:10px 12px;font-size:15px;text-align:left}th{width:30%;background:#fafafa;font-weight:500}
.f{position:absolute;left:64px;right:64px;bottom:32px;font:11px/1.5 ui-monospace,monospace;color:#666;border-top:1px dashed #bbb;padding-top:8px}@media print{body{background:#fff;padding:0}.page{box-shadow:none}}</style>
<div class="page">${docBody(form, snap.data)}<div class="f">Zero Form · ${snap.applicationId} · snapshot v${snap.v}<br>snapshot sha256:${snap.hash}<br>document sha256:${snap.docs[form.id]}</div></div>`;

// ---------- verification (officer side) ----------
async function verifySnapshot(snap) {
  const body = { v: snap.v, prev: snap.prev, schema: snap.schema, applicationId: snap.applicationId, data: snap.data, provenance: snap.provenance, ...(snap.roles ? { roles: snap.roles } : {}) };
  const hash = sha256(canonical(body)).toString('hex');
  const sealed = canonical({ hash: snap.hash, confirmation: snap.confirmation });
  const sigOk = crypto.verify(null, Buffer.from(sealed), serverPub, Buffer.from(snap.serverSig, 'base64'));
  const integrity = hash === snap.hash && sigOk;
  const c = snap.confirmation;
  const identity = sigOk && c.hash === hash && c.to === db.profile['person.phone'].value && db.profile['person.phone'].verified;
  const docs = FORMS.filter((f) => !f.onFile).map((f) => ({ id: f.id, name: f.name, ok: !!snap.pdfs?.[f.id] && fs.existsSync(snap.pdfs[f.id].path) && sha256(fs.readFileSync(snap.pdfs[f.id].path)).toString('hex') === snap.docs[f.id] }));
  const res = NAME_RESERVATIONS['113045678'];
  const evidence = res['company.name'] === snap.data['company.name'];
  const hh = HOUSEHOLD_REGISTRY[snap.data['person.nationalId']];
  const records = !!hh && hh.name === snap.data['person.name'];
  return {
    checks: [
      { key: 'identity', label: 'Identity', ok: identity, detail: identity ? `SMS code to ${mask(c.to)} confirmed this exact snapshot` : 'Confirmation does not match contents' },
      { key: 'integrity', label: 'Integrity', ok: integrity, detail: integrity ? 'Hash + server signature match' : 'Contents changed after signing' },
      { key: 'consistency', label: 'Consistency', ok: docs.every((d) => d.ok), detail: `${docs.filter((d) => d.ok).length} of ${docs.length} documents match` },
      { key: 'evidence', label: 'Evidence', ok: evidence, detail: evidence ? 'Name reservation #113045678 valid' : 'Name differs from reservation' },
      { key: 'records', label: 'Gov records', ok: records, detail: records ? 'Household registration match' : 'No registry match' },
    ],
    docs,
    externalReview: await externalReview(snap),
    mode: 'demo_only',
  };
}

// ---------- http ----------
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

// Second factor: one-time code to the phone number already verified on the profile (SMS simulated for the demo).
const mask = (p) => p.replace(/(\d{4})-(\d{3})-(\d{3})/, '$1-•••-$3');
let pendingOtp = null; // { code, purpose, body?, hash? }
const sendOtp = (purpose, extra = {}) => {
  pendingOtp = { code: String(crypto.randomInt(100000, 999999)), purpose, ...extra };
  const to = db.profile['person.phone'].value;
  console.log(`[sms] to ${to}: Zero Form code ${pendingOtp.code}`);
  return { to: mask(to), demoCode: pendingOtp.code };
};
// Mocked for the demo: any 6-digit code passes. Swap in a real SMS/OTP provider here.
const checkOtp = (purpose, code) => pendingOtp?.purpose === purpose && /^\d{6}$/.test(String(code).trim());

const publicState = () => {
  const a = db.app;
  return {
    phone: mask(db.profile['person.phone'].value),
    profile: db.profile,
    app: a && { id: a.id, status: a.status, draft: a.draft, missing: missing(a), decision: a.decision, reopen: a.reopen,
      attachments: Object.values(a.attachments || {}).map(({path: _path, ...item}) => item), evidenceRevision: a.evidenceRevision || 0,
      snapshot: a.snapshots.at(-1) && { v: a.snapshots.at(-1).v, hash: a.snapshots.at(-1).hash, prev: a.snapshots.at(-1).prev, signedAt: a.snapshots.at(-1).signedAt, to: mask(a.snapshots.at(-1).confirmation.to) } },
  };
};

app.get('/api/state', (_q, r) => r.json(publicState()));
app.post('/api/login/send', (_q, r) => r.json(sendOtp('login')));
app.post('/api/login/verify', (q, r) => {
  if (!checkOtp('login', q.body.code)) return r.status(400).json({ error: 'That code is not right. Try again.' });
  pendingOtp = null;
  if (!db.app || ['approved', 'rejected'].includes(db.app.status)) db.app = newApp();
  save();
  r.json(publicState());
});

const setFacts = (values, source) => {
  const errors = {};
  for (const [k, value] of Object.entries(values)) {
    if (!FIELDS[k]) continue;
    const err = validate(k, value);
    if (err) { errors[k] = err; continue; }
    db.app.draft[k] = { value: String(value).trim(), source, verified: false };
  }
  save();
  return errors;
};
app.post('/api/answer', (q, r) => {
  if (!db.app) return r.status(400).json({ error: 'no application' });
  const errors = setFacts(q.body.values, 'Applicant');
  if (Object.keys(errors).length) return r.status(422).json({ errors });
  r.json(publicState());
});
// Agent API: same schema, drafts only. Signing still requires the human's SMS code.
app.get('/api/agent/schema', (_q, r) => r.json({ fields: FIELDS, forms: FORMS, missing: db.app ? missing(db.app) : allFieldKeys() }));
app.post('/api/agent/draft', (q, r) => {
  if (!db.app) return r.status(400).json({ error: 'applicant has not started' });
  const errors = setFacts(q.body.values, 'Agent draft');
  r.json({ errors, missing: missing(db.app) });
});

app.post('/api/sign/send', (_q, r) => {
  const a = db.app;
  if (missing(a).filter((k) => k !== a.reopen).length) return r.status(400).json({ error: 'incomplete' });
  const body = snapshotBody(a);
  const hash = sha256(canonical(body)).toString('hex');
  r.json({ hash, ...sendOtp('sign', { body, hash }) });
});
app.post('/api/sign/verify', async (q, r) => {
  if (generating) return r.status(409).json({ error: 'Document generation is already running.' });
  if (!checkOtp('sign', q.body.code)) return r.status(400).json({ error: 'That code is not right. Try again.' });
  const target = db.app;
  const { body, hash } = pendingOtp;
  if (!target || sha256(canonical(snapshotBody(target))).toString('hex') !== hash) return r.status(409).json({ error: 'Application changed. Confirm the updated version.' });
  generating = true;
  try {
    const generated = await renderCore(body, hash);
    if (db.app !== target || sha256(canonical(snapshotBody(target))).toString('hex') !== hash) return r.status(409).json({ error: 'Application changed during generation. Confirm again.' });
    pendingOtp = null;
    const confirmation = { method: 'demo-sms-otp', to: db.profile['person.phone'].value, hash, at: new Date().toISOString() };
    const serverSig = crypto.sign(null, Buffer.from(canonical({ hash, confirmation })), serverKey).toString('base64');
    const docs = Object.fromEntries(Object.entries(generated.documents).map(([id, file]) => [id, file.sha256]));
    target.snapshots.push({ ...body, hash, confirmation, serverSig, docs, pdfs: generated.documents, coreSnapshotHash: generated.snapshot_hash, signedAt: confirmation.at, mode: 'demo_only' });
    target.status = 'submitted'; target.reopen = null; target.decision = null;
    target.evidenceRevision = (target.evidenceRevision || 0) + 1;
    for (const k of Object.keys(body.data)) if (!k.startsWith('app.')) db.profile[k] = { ...target.draft[k] };
    save(); r.json(publicState());
  } catch (error) {
    console.error('Core generation failed:', error.message);
    r.status(502).json({ error: 'Core PDF generation failed. Check local renderer dependencies and retry.', detail: error.stderr?.slice(-1200) || error.message });
  } finally { generating = false; }
});

app.get('/doc/:v/:form', (q, r) => {
  const snap = db.app?.snapshots.find((s) => s.v === Number(q.params.v));
  const form = FORMS.find((f) => f.id === q.params.form);
  if (!snap || !form || form.onFile) return r.status(404).send('Not found');
  const file = snap.pdfs?.[form.id];
  if (!file || !fs.existsSync(file.path)) return r.status(409).json({ error: 'Generate a new signed snapshot to create native PDFs.' });
  r.set('Content-Disposition', `${q.query.download === '1' ? 'attachment' : 'inline'}; filename="${form.id}.pdf"`);
  r.type('pdf').sendFile(path.resolve(file.path));
});
app.get('/api/package/:v', (q, r) => {
  const snap = db.app?.snapshots.find((s) => s.v === Number(q.params.v));
  if (!snap) return r.status(404).end();
  r.json({ ...snap, serverPublicKey: serverPub.export({ type: 'spki', format: 'pem' }) });
});

// officer
app.get('/api/officer', async (_q, r) => {
  const a = db.app;
  if (!a?.snapshots.length) return r.json({ app: null });
  const snap = a.snapshots.at(-1);
  r.json({ app: { id: a.id, status: a.status, decision: a.decision, v: snap.v, hash: snap.hash, prev: snap.prev, signedAt: snap.signedAt, data: snap.data, provenance: snap.provenance,
    usedIn: Object.fromEntries(Object.keys(snap.data).map((k) => [k, FORMS.filter((f) => f.fields.includes(k)).length])) }, verify: await verifySnapshot(snap), fields: FIELDS });
});
app.post('/api/officer/decide', async (q, r) => {
  const a = db.app, { decision, field, note } = q.body;
  if (!a?.snapshots.length) return r.status(400).json({ error: 'nothing to decide' });
  if (!['approve', 'reject', 'revise'].includes(decision)) return r.status(400).json({ error: 'Invalid decision' });
  const verification = await verifySnapshot(a.snapshots.at(-1));
  if (decision === 'approve' && (!verification.checks.every(c => c.ok) || verification.externalReview.recommendation !== 'approve')) return r.status(409).json({ error: 'Resolve document checks before approving.', verify: verification });
  a.decision = { decision, field, note, at: new Date().toISOString(), evidenceRevision: a.evidenceRevision || 0, snapshotHash: a.snapshots.at(-1).hash };
  a.status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'revision';
  if (decision === 'revise') a.reopen = field;
  save();
  r.json({ ok: true });
});

app.post('/api/attachments', express.raw({ type: 'application/pdf', limit: '10mb' }), async (q, r) => {
  const target = db.app, kind = q.query.kind;
  if (!target?.snapshots.length) return r.status(400).json({ error: 'Sign and generate the application first.' });
  if (!ATTACHMENT_KINDS.includes(kind) || !Buffer.isBuffer(q.body) || q.body.subarray(0,5).toString() !== '%PDF-') return r.status(400).json({ error: 'Upload a demo PDF with a supported kind.' });
  const id = crypto.randomUUID(), file = path.resolve(DATA, 'attachments', id + '.pdf');
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, q.body);
  try {
    const program = "import sys,json;from pathlib import Path;sys.path.insert(0,'demo');from server import extract_pdf;from review import parse_document;print(json.dumps(parse_document(extract_pdf(Path(sys.argv[1])),sys.argv[2])))";
    const { stdout } = await execute('python3', ['-c', program, file, kind], { cwd: ROOT, timeout: 20000 });
    if (db.app !== target) return r.status(409).json({ error: 'Application changed.' });
    const attachment = { id, kind, fields: JSON.parse(stdout), sha256: sha256(q.body).toString('hex'), path: file, url: '/api/attachments/' + id };
    target.attachments ||= {}; target.attachments[kind] = attachment;
    target.evidenceRevision = (target.evidenceRevision || 0) + 1; target.decision = null;
    if (['approved', 'rejected'].includes(target.status)) target.status = 'submitted';
    save(); r.status(201).json({ attachment: { ...attachment, path: undefined }, review: await externalReview(target.snapshots.at(-1)) });
  } catch (error) { fs.rmSync(file, { force: true }); r.status(422).json({ error: 'Could not read marked demo evidence.', detail: error.stderr?.slice(-500) }); }
});
app.get('/api/attachments/:id', (q, r) => {
  const attachment = Object.values(db.app?.attachments || {}).find(x => x.id === q.params.id);
  if (!attachment) return r.status(404).end();
  r.type('pdf').sendFile(path.resolve(attachment.path));
});
app.get('/api/mock-attachments/:kind', async (q, r) => {
  const snap = db.app?.snapshots.at(-1), kind = q.params.kind;
  if (!snap || !ATTACHMENT_KINDS.includes(kind)) return r.status(400).json({ error: 'Generate a signed application first and choose a supported kind.' });
  const dir = path.resolve(DATA, 'mock', crypto.randomUUID()); fs.mkdirSync(dir, { recursive: true });
  const input = path.join(dir, 'snapshot.json'), output = path.join(dir, kind + '.pdf'); fs.writeFileSync(input, JSON.stringify(snap));
  try {
    await execute('python3', ['scripts/render-mock-evidence.py','--input',input,'--kind',kind,'--out',output], { cwd: ROOT, timeout: 30000 });
    r.type('pdf').set('Content-Disposition', `attachment; filename="MOCK-${kind}.pdf"`).sendFile(output);
  } catch(error) { r.status(502).json({ error: 'Mock evidence generation unavailable.', detail: error.stderr?.slice(-500) }); }
});

// demo controls
app.post('/api/demo/tamper', (_q, r) => { const s = db.app?.snapshots.at(-1); if (s) { s.data['company.capital'] = String(Number(s.data['company.capital']) * 10); save(); } r.json({ ok: !!s }); });
app.post('/api/demo/reset', (_q, r) => { db = fresh(); save(); r.json({ ok: true }); });

app.listen(PORT, () => console.log(`Zero Form → ${ORIGIN}/  ·  officer → ${ORIGIN}/officer.html`));
