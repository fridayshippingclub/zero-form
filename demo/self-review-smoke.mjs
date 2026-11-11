import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-form-self-review-'));
const base = 'http://127.0.0.1:5189';
const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '5189', DATA_DIR: dir, ANTHROPIC_API_KEY: '', CLAUDE_API_KEY: '', ZERO_FORM_ENABLE_LLM: '0' }, stdio: ['ignore','pipe','pipe'] });
server.stderr.on('data', b => process.stderr.write(b));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function request(route, body, status = 200) {
  const response = await fetch(base + route, body === undefined ? {} : { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
}
async function upload(kind, bytes) {
  const response = await fetch(base+'/api/attachments?kind='+kind, {method:'POST',headers:{'Content-Type':'application/pdf'},body:bytes});
  assert.equal(response.status,201,await response.text());
}
async function readyReview() {
  const review = await request('/api/self-review', {});
  assert.equal(review.stage,'draft'); assert.equal(review.recommendation,'ready_to_submit',JSON.stringify(review));
  assert.equal(review.explanation.available,false); assert.ok(review.checks.every(c=>c.status==='passed'));
  await request('/api/sign/send', {});
  return review;
}
try {
  await new Promise((resolve,reject) => { server.stdout.once('data',resolve); server.once('exit',()=>reject(new Error('server exited'))); });
  assert.equal((await request('/api/self-review/readiness')).available, false);
  const login = await request('/api/login/send', {}); await request('/api/login/verify', {code:login.demoCode});
  await request('/api/answer', {values:{'company.address':'臺北市大安區仁愛路四段 1 號','company.capital':'10000000','owner.name':'陳大文'}});
  const absent = await request('/api/self-review', {}); assert.equal(absent.recommendation,'needs_attention');
  await request('/api/sign/send', {}, 409);
  const matching = {};
  for (const kind of ['capital_verification','address_approval','name_approval']) {
    const mock = await fetch(base+'/api/mock-attachments/'+kind); assert.ok(mock.ok);
    matching[kind] = Buffer.from(await mock.arrayBuffer()); await upload(kind,matching[kind]);
  }
  const ready = await readyReview();
  assert.ok(ready.extraction.every(e=>e.source_sha256 && e.observations.some(o=>o.page===1)));
  const state = await request('/api/state'); assert.equal(state.app.snapshot,undefined);
  const baseline = Object.fromEntries(Object.entries(state.app.draft).map(([key,fact])=>[key,fact.value]));
  const cases = [
    {name:'Address precheck mismatch',kind:'address_approval',key:'company.address',value:'示範市測試區不同路 99 號',field:'Address',expected:baseline['company.address'],actual:'示範市測試區不同路 99 號'},
    {name:'Name reservation mismatch',kind:'name_approval',key:'company.name',value:'另一家展示科技',field:'Company-Name',expected:baseline['company.name'],actual:'另一家展示科技'},
    {name:'Declared TWD 10,000,000 versus report TWD 1,000,000',kind:'capital_verification',key:'company.capital',value:'1000000',field:'Capital-TWD',expected:10000000,actual:1000000},
    {name:'Certification date versus articles date (demo rule)',kind:'capital_verification',key:'company.articles_date',value:'2026-11-10',field:'demo_rule: audit.certified_on = company.articles_date',observationField:'Certified-On',expected:baseline['company.articles_date'],actual:'2026-11-10'},
  ];
  const results = [];
  for (const [index,test] of cases.entries()) {
    const input = path.join(dir,`mismatch-${index}.json`), pdf = path.join(dir,`mismatch-${index}.pdf`);
    fs.writeFileSync(input,JSON.stringify({data:{...baseline,[test.key]:test.value}}));
    execFileSync('python3',['scripts/render-mock-evidence.py','--input',input,'--kind',test.kind,'--out',pdf],{stdio:['ignore','ignore','pipe']});
    const bytes = fs.readFileSync(pdf); await upload(test.kind,bytes);
    assert.equal((await request('/api/state')).app.selfReview,null);
    await request('/api/sign/send',{},409);
    const review = await request('/api/self-review',{}); assert.equal(review.recommendation,'needs_attention');
    const check = review.checks.find(c=>c.kind===test.kind && c.field===test.field);
    assert.ok(check); assert.equal(check.status,'mismatch');assert.equal(check.expected,test.expected);assert.equal(check.actual,test.actual);
    assert.ok(review.checks.filter(c=>c!==check).every(c=>c.status==='passed'),'Each scenario must isolate one mismatch');
    const extraction = review.extraction.find(e=>e.kind===test.kind);
    assert.equal(extraction.source_sha256,digest(bytes));assert.equal(extraction.mode,'deterministic');
    const observation = extraction.observations.find(o=>o.field===(test.observationField||test.field));
    assert.equal(String(observation.value),String(test.actual));assert.equal(check.source.page,1);assert.equal(check.source.page,observation.page);
    assert.equal(check.source.quote,observation.quote);assert.ok(check.source.quote.length>0);
    assert.ok(check.source.bbox.length===4 && check.source.bbox.every(Number.isFinite));
    const original = await fetch(base+check.source.url);assert.ok(original.ok);assert.equal(digest(Buffer.from(await original.arrayBuffer())),digest(bytes));
    await request('/api/sign/send',{},409);
    await upload(test.kind,matching[test.kind]);await readyReview();
    results.push({scenario:test.name,expected:check.expected,observed:check.actual,status:check.status,page:check.source.page,quote:check.source.quote,source_sha256:extraction.source_sha256,signing_blocked:true,matching_restored:'ready_to_submit'});
  }
  await request('/api/answer',{values:{'company.capital':'10000000'}});
  assert.equal((await request('/api/state')).app.selfReview,null);await request('/api/sign/send',{},409);await readyReview();
  const blank = path.join(dir,'blank.pdf');
  execFileSync('python3',['-c',"from reportlab.pdfgen import canvas;import sys;c=canvas.Canvas(sys.argv[1]);c.showPage();c.save()",blank]);
  await upload('capital_verification',fs.readFileSync(blank));
  const unknown = await request('/api/self-review',{});assert.equal(unknown.recommendation,'unknown');await request('/api/sign/send',{},409);
  await upload('capital_verification',matching.capital_verification);await readyReview();
  console.log(JSON.stringify({result:'PASS',live_model_calls:0,scenarios:results,unknown_pdf:'unknown; signing blocked; matching restored',draft_edit:'review invalidated; signing blocked until re-review'},null,2));
} finally { if (server.exitCode === null) {server.kill();await new Promise(resolve=>server.once('exit',resolve));} fs.rmSync(dir,{recursive:true,force:true}); }
