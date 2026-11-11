// Full local demo: draft evidence -> self-review -> confirmation -> native PDFs -> reviewer approval.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-form-happy-'));
const port = 5174, base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', ZERO_FORM_ENABLE_LLM: '0', PORT: String(port), DATA_DIR: dir }, stdio: ['ignore','pipe','pipe'] });
server.stderr.on('data', b => process.stderr.write(b));
async function request(route, body) {
 const response = await fetch(base + route, body === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return data;
}
try {
 await new Promise((resolve,reject) => { server.stdout.once('data',resolve); server.once('exit',()=>reject(new Error('server exited'))); });
 const login = await request('/api/login/send',{});
 await request('/api/login/verify',{code:login.demoCode});
 await request('/api/answer',{values:{'company.address':'臺北市大安區仁愛路四段 1 號','company.capital':'10000','owner.name':'陳大文'}});
 assert.equal((await fetch(base+'/api/sign/send',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,409);
 for(const kind of ['capital_verification','address_approval','name_approval']) {
  const generated = await fetch(base+'/api/mock-attachments/'+kind);
  assert.ok(generated.ok, await (generated.ok ? Promise.resolve('') : generated.text()));
  const upload = await fetch(base+'/api/attachments?kind='+kind,{method:'POST',headers:{'Content-Type':'application/pdf'},body:Buffer.from(await generated.arrayBuffer())});
  assert.ok(upload.ok,JSON.stringify(await upload.json()));
 }
 const selfReview = await request('/api/self-review',{});
 assert.equal(selfReview.recommendation,'ready_to_submit');
 const sign = await request('/api/sign/send',{});
 const submitted = await request('/api/sign/verify',{code:sign.demoCode});
 assert.equal(submitted.app.status,'submitted');
 const pdf = await fetch(base+'/doc/1/app');
 assert.equal(pdf.headers.get('content-type').split(';')[0],'application/pdf');
 assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
 const officer = await request('/api/officer');
 assert.ok(officer.verify.checks.every(c=>c.ok),JSON.stringify(officer.verify));
 assert.equal(officer.verify.externalReview.recommendation,'approve');
 await request('/api/officer/decide',{decision:'approve',note:'Matching demo evidence'});
 assert.equal((await request('/api/state')).app.status,'approved');
 console.log('PASS: draft inputs -> 3 uploaded matching PDFs -> current self-review -> 7 native PDFs -> officer approval');
} finally { if(server.exitCode === null) { server.kill(); await new Promise(resolve=>server.once('exit',resolve)); } fs.rmSync(dir,{recursive:true,force:true}); }
