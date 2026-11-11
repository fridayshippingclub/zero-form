// Full local demo: confirmation -> native PDFs -> marked attachments -> reviewer approval.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-form-agent-review-'));
const port = 5187, base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir }, stdio: ['ignore','pipe','pipe'] });
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
 await request('/api/login/verify',{code:login.demoCode});
 await request('/api/answer',{values:{'company.address':'臺北市大安區仁愛路四段 1 號','company.capital':'10000','owner.name':'陳大文'}});
 const sign = await request('/api/sign/send',{});
 const submitted = await request('/api/sign/verify',{code:sign.demoCode});
 assert.equal(submitted.app.status,'submitted');
 const pdf = await fetch(base+'/doc/1/app');
 assert.equal(pdf.headers.get('content-type').split(';')[0],'application/pdf');
 assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
 for(const kind of ['capital_verification','address_approval','name_approval']) {
  const generated = await fetch(base+'/api/mock-attachments/'+kind);
  assert.ok(generated.ok, await (generated.ok ? Promise.resolve('') : generated.text()));
  const upload = await fetch(base+'/api/attachments?kind='+kind,{method:'POST',headers:{'Content-Type':'application/pdf'},body:Buffer.from(await generated.arrayBuffer())});
  assert.ok(upload.ok,JSON.stringify(await upload.json()));
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
 assert.equal((await fetch(base+review.documents[0].url)).status,200);
 assert.equal((await fetch(base+review.documents[0].url.replace(review.application.hash,'wrong'))).status,409);
 console.log('PASS: agent schema -> signed native PDFs -> parsed matching uploads -> approve recommendation, no human decision; document hash guard enforced');
} finally { if(server.exitCode === null) { server.kill(); await new Promise(resolve=>server.once('exit',resolve)); } fs.rmSync(dir,{recursive:true,force:true}); }
