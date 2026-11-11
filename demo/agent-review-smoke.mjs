// Full local demo: required attachments -> self-review -> confirmation -> six native PDFs -> revision eligibility.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-form-agent-review-'));
const port = 5187, base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, ANTHROPIC_API_KEY: '', CLAUDE_API_KEY: '', ZERO_FORM_ENABLE_LLM: '0' }, stdio: ['ignore','pipe','pipe'] });
server.stderr.on('data', b => process.stderr.write(b));
async function request(route, body) {
 const response = await fetch(base + route, body === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return data;
}
try {
 await new Promise((resolve,reject) => { server.stdout.once('data',resolve); server.once('exit',()=>reject(new Error('server exited'))); });
 assert.equal((await fetch(base+'/api/agent/review')).status,404);
 const schema = await request('/api/agent/schema');
 assert.equal(schema.roles.applicant,schema.roles.director);
 assert.equal(schema.counts.generatedDocuments,6);
 const login = await request('/api/login/send',{});
 const loggedIn = await request('/api/login/verify',{code:login.demoCode});
 assert.equal(loggedIn.app.draft['company.reservation_no'].value,'113045678');
 for (const route of ['/api/answer','/api/agent/draft']) {
  const denied = await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:{'company.reservation_no':'999999999'}})});
  assert.equal(denied.status,route === '/api/answer' ? 422 : 200);
  assert.match((await denied.json()).errors['company.reservation_no'],/Read-only/);
 }
 assert.equal((await request('/api/state')).app.draft['company.reservation_no'].value,'113045678');
 await request('/api/answer',{values:{'company.address':'臺北市大安區仁愛路四段 1 號','company.capital':'10000','owner.name':'陳大文'}});
 for(const kind of ['capital_verification','address_approval','name_approval']) {
  const generated = await fetch(base+'/api/mock-attachments/'+kind);
  assert.ok(generated.ok, await (generated.ok ? Promise.resolve('') : generated.text()));
  const upload = await fetch(base+'/api/attachments?kind='+kind,{method:'POST',headers:{'Content-Type':'application/pdf'},body:Buffer.from(await generated.arrayBuffer())});
  assert.ok(upload.ok,JSON.stringify(await upload.json()));
 }
 const selfReview = await request('/api/self-review',{}); assert.equal(selfReview.recommendation,'ready_to_submit');
 const sign = await request('/api/sign/send',{});
 const submitted = await request('/api/sign/verify',{code:sign.demoCode});
 assert.equal(submitted.app.status,'submitted');
 const pdf = await fetch(base+'/doc/1/app');
 assert.equal(pdf.headers.get('content-type').split(';')[0],'application/pdf');
 assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
 for (const form of ['app','t70135']) {
  const response = await fetch(base+'/doc/1/'+form); assert.equal(response.status,200);
  const file = path.join(dir,form+'.pdf'); fs.writeFileSync(file,Buffer.from(await response.arrayBuffer()));
  const text = execFileSync(process.env.ZERO_FORM_PDFTOTEXT || (fs.existsSync('.tools/bin/pdftotext') ? '.tools/bin/pdftotext' : 'pdftotext'),['-f','1','-l','1',file,'-'],{encoding:'utf8'});
  assert.ok(text.includes('113045678'), form+' first page must contain the seeded reservation number');
 }
 const review = await request('/api/agent/review');
 assert.equal(review.mode,'demo_only');
 assert.equal(review.recommendation,'approve');
 assert.equal(review.decision,null);
 assert.equal(review.documents.length,6);
 assert.equal(review.attachments.length,3);
 assert.ok(review.checks.every(c=>c.status==='passed'),JSON.stringify(review.checks));
 assert.ok(review.documents.every(d=>d.confidence==='verified_render'));
 assert.ok(!JSON.stringify(review).includes(dir),'must not expose local paths');
 const dateCheck = review.checks.find(c=>c.field==='demo_rule: audit.certified_on = company.articles_date');
 assert.equal(dateCheck.sources.expected[0].field,'company.articles_date');
 assert.equal(dateCheck.sources.actual[0].field,'Certified-On');
 for (const document of review.documents) {
  const response = await fetch(base+document.url); assert.equal(response.status,200); assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
 }
 assert.equal((await fetch(base+review.documents[0].url.replace(review.application.hash,'wrong'))).status,409);
 await request('/api/officer/decide',{decision:'revise',field:'company.capital',note:'Please confirm the corrected capital.'});
 await request('/api/agent/draft',{values:{'company.capital':'12000'}});
 assert.ok((await request('/api/state')).app.missing.includes('company.capital'),'Agent draft must not acknowledge the applicant correction');
 assert.equal((await fetch(base+'/api/sign/send',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,409);
 await request('/api/answer',{values:{'company.capital':'12000'}});
 const corrected = await request('/api/state'); assert.equal(corrected.app.reopen,'company.capital'); assert.ok(!corrected.app.missing.includes('company.capital'));
 const replacement = await fetch(base+'/api/mock-attachments/capital_verification'); assert.ok(replacement.ok);
 const uploaded = await fetch(base+'/api/attachments?kind=capital_verification',{method:'POST',headers:{'Content-Type':'application/pdf'},body:Buffer.from(await replacement.arrayBuffer())}); assert.equal(uploaded.status,201);
 assert.equal((await request('/api/self-review',{})).recommendation,'ready_to_submit');
 await request('/api/sign/send',{});
 console.log('PASS: mandatory pre-upload/self-review -> signed six native PDFs -> all verification checks pass; applicant correction enables resubmission while agent draft does not. No live model calls.');
} finally { if(server.exitCode === null) { server.kill(); await new Promise(resolve=>server.once('exit',resolve)); } fs.rmSync(dir,{recursive:true,force:true}); }
