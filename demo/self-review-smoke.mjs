import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-form-self-review-'));
const base = 'http://127.0.0.1:5189';
const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '5189', DATA_DIR: dir, ANTHROPIC_API_KEY: '', ZERO_FORM_ENABLE_LLM: '0' }, stdio: ['ignore','pipe','pipe'] });
server.stderr.on('data', b => process.stderr.write(b));
async function request(route, body, status = 200) {
  const response = await fetch(base + route, body === undefined ? {} : { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
}
try {
  await new Promise((resolve,reject) => { server.stdout.once('data',resolve); server.once('exit',()=>reject(new Error('server exited'))); });
  assert.equal((await request('/api/self-review/readiness')).available, false);
  const login = await request('/api/login/send', {}); await request('/api/login/verify', {code:login.demoCode});
  await request('/api/answer', {values:{'company.address':'臺北市大安區仁愛路四段 1 號','company.capital':'10000','owner.name':'陳大文'}});
  const absent = await request('/api/self-review', {}); assert.equal(absent.recommendation,'needs_attention');
  await request('/api/sign/send', {}, 409);
  for (const kind of ['capital_verification','address_approval','name_approval']) {
    const mock = await fetch(base+'/api/mock-attachments/'+kind); assert.ok(mock.ok);
    const upload = await fetch(base+'/api/attachments?kind='+kind,{method:'POST',headers:{'Content-Type':'application/pdf'},body:Buffer.from(await mock.arrayBuffer())});
    assert.equal(upload.status,201,await upload.text());
  }
  const ready = await request('/api/self-review', {});
  assert.equal(ready.stage,'draft'); assert.equal(ready.recommendation,'ready_to_submit',JSON.stringify(ready));
  assert.equal(ready.explanation.available,false); assert.ok(ready.checks.every(c=>c.status==='passed'));
  assert.ok(ready.extraction.every(e=>e.source_sha256 && e.observations.some(o=>o.page===1)));
  assert.equal((await request('/api/state')).app.snapshot,undefined);
  await request('/api/sign/send', {});
  await request('/api/answer',{values:{'company.capital':'20000'}});
  assert.equal((await request('/api/state')).app.selfReview,null);
  await request('/api/sign/send', {},409);
  const mismatch = await request('/api/self-review',{}); assert.equal(mismatch.recommendation,'needs_attention');
  assert.ok(mismatch.checks.some(c=>c.field==='Capital-TWD' && c.status==='mismatch'));
  await request('/api/answer',{values:{'company.capital':'10000'}});
  const blank = path.join(dir,'blank.pdf');
  execFileSync('python3',['-c',"from reportlab.pdfgen import canvas;import sys;c=canvas.Canvas(sys.argv[1]);c.showPage();c.save()",blank]);
  const uploaded = await fetch(base+'/api/attachments?kind=capital_verification',{method:'POST',headers:{'Content-Type':'application/pdf'},body:fs.readFileSync(blank)});assert.equal(uploaded.status,201);
  const unknown = await request('/api/self-review',{});assert.equal(unknown.recommendation,'unknown');
  await request('/api/sign/send',{},409);
  console.log('PASS: offline draft uploads -> source-grounded deterministic self-review -> signing guard; mismatch, unknown PDF and draft invalidation distinguished. No live LLM calls.');
} finally { if (server.exitCode === null) {server.kill();await new Promise(resolve=>server.once('exit',resolve));} fs.rmSync(dir,{recursive:true,force:true}); }
