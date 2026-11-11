import { FIELDS, FORMS, validate, money, rocDate } from '/schema.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The questions we ask, in conversational order. Anything else comes from verified sources.
const ASK = {
  'company.address': { q: 'Where will the company be registered?', ph: '臺北市大安區復興南路一段 390 號 5 樓' },
  'company.capital': { q: 'How much capital are you starting with?', ph: '1,000,000', pre: 'NT$', num: true },
  'director2.name': { q: 'Who is the second director?', ph: '吳小明' },
  'director2.nationalId': { q: 'What is their national ID number?', ph: 'F123456784', upper: true },
  'owner.name': { q: 'Who owns the building at that address?', ph: '林美華', hint: "We'll prepare their consent letter for them." },
};
const ORDER = Object.keys(ASK);
const DOCS = FORMS.filter((f) => !f.onFile);
const fmt = (k, v) => (k === 'company.capital' ? `NT$ ${money(v)}` : k === 'company.name' ? `${v}有限公司` : k === 'app.date' ? rocDate(v) : v);

let S = null;                       // server state (source of truth)
let ui = { step: 'welcome', qs: [], i: 0, err: '', busy: false, returnTo: null };

const api = async (path, body) => {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), j);
  return j;
};

// ---------- derive which screen we are on ----------
function screen() {
  const st = S?.app?.status;
  if (st && st !== 'draft' && !['q', 'review', 'otp'].includes(ui.step)) return st === 'revision' ? 'fixintro' : 'done';
  return ui.step;
}
const progress = { welcome: 0, otp: 6, known: 12, q: null, review: 92, done: 100, fixintro: 70 };

function render() {
  const s = screen();
  const pct = s === 'q' ? 15 + (75 * ui.i) / Math.max(ui.qs.length, 1) : progress[s];
  $('progress').style.width = pct + '%';
  $('app').innerHTML = `<section class="screen">${VIEWS[s]()}</section>`;
  const inp = document.querySelector('input'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
}

const source = (f) => !f ? '' : f.source === 'Applicant' ? '<span class="tag you">You</span>'
  : f.source === 'Agent draft' ? '<span class="tag agent">✦ Agent draft</span>'
  : `<span class="tag ok">${esc(f.source)}</span>`;

const VIEWS = {
  welcome: () => `
    <div class="eyebrow zh">臺北市商業處 · 有限公司設立登記</div>
    <h1>${DOCS.length + 1} forms.<br>One conversation.</h1>
    <p class="lead">Answer a few questions once. Zero Form fills in every form the city needs, you sign once, and it's sent.</p>
    <div class="steps">
      <div><b>1</b>Confirm what we already know</div>
      <div><b>2</b>Answer ${ORDER.length} short questions</div>
      <div><b>3</b>Sign once with a text code</div>
    </div>
    <div class="spacer"></div>
    <div class="err">${esc(ui.err)}</div>
    <button class="btn primary" data-go="login" ${ui.busy ? 'disabled' : ''}>Get started <span style="opacity:.6">↵</span></button>
    <div class="note">We'll text a code to the phone number you've already verified (${esc(S.phone)}).</div>`,

  otp: () => `
    <div class="eyebrow">${ui.otp.purpose === 'sign' ? 'Last step' : 'Verify it’s you'}</div>
    <h2>${ui.otp.purpose === 'sign' ? 'Enter the code to sign and submit.' : 'Enter the code we texted you.'}</h2>
    <p class="lead">Sent to ${esc(ui.otp.to)}${ui.otp.purpose === 'sign' ? ` — this code confirms fingerprint <span class="mono" style="font-size:13px">${ui.otp.hash.slice(0, 12)}…</span>` : ''}.</p>
    <form class="field" id="qf"><input id="qi" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" style="letter-spacing:10px" value="${esc(ui.draftVal ?? '')}"></form>
    <div class="err">${ui.err ? '⚠ ' + esc(ui.err) : ''}</div>
    <div class="sms" data-go="fillCode"><b>📱 Messages · now</b><span>Zero Form: your code is <b>${ui.otp.demoCode}</b>. Tap to fill.</span></div>
    <div class="spacer"></div>
    <button class="btn primary blue" data-go="verify" ${ui.busy ? 'disabled' : ''}>${ui.busy ? '<i class="spin"></i>' : ''}${ui.otp.purpose === 'sign' ? 'Sign & submit' : 'Continue'} <span style="opacity:.6">↵</span></button>`,

  known: () => {
    const d = S.app.draft;
    const keys = ['person.name', 'person.nationalId', 'person.phone', 'person.address', 'company.name', 'company.items', ...ORDER.filter((k) => !ui.qs.includes(k))];
    return `
    <div class="eyebrow">Welcome back, ${esc(d['person.name'].value)}</div>
    <h2>We already know this.<br>Still correct?</h2>
    <div class="facts">${keys.filter((k) => d[k]).map((k) => `
      <div class="fact"><div class="check">✓</div><div class="grow"><div class="k zh">${FIELDS[k].label} · ${FIELDS[k].en}</div><div class="v zh">${esc(fmt(k, d[k].value))}</div></div>${source(d[k])}</div>`).join('')}
    </div>
    <div class="spacer"></div>
    <button class="btn primary" data-go="confirmKnown">Yes, use these <span style="opacity:.6">↵</span></button>
    <div class="note">Reused across all ${DOCS.length + 1} forms — you won't type any of this.</div>`;
  },

  q: () => {
    const k = ui.qs[ui.i], a = ASK[k], f = FIELDS[k], cur = S.app.draft[k];
    const val = ui.draftVal ?? (cur?.value ?? '');
    const used = FORMS.filter((x) => x.fields.includes(k));
    return `
    <div class="qnum">${ui.qs.length > 1 ? `${ui.i + 1} of ${ui.qs.length} →` : 'One fix →'} ${cur?.source === 'Agent draft' ? '<span class="tag agent">✦ Drafted by your agent — check it</span>' : ''}</div>
    <h2>${a.q}</h2>
    <div class="qlabel zh">${f.label} · ${f.en}</div>
    <form class="field" id="qf">${a.pre ? `<span class="pre">${a.pre}</span>` : ''}<input id="qi" autocomplete="off" placeholder="${a.ph}" value="${esc(a.num && val ? money(val) : val)}"></form>
    <div class="err">${ui.err ? '⚠ ' + esc(ui.err) : a.hint ? `<span style="color:var(--ink3)">${a.hint}</span>` : ''}</div>
    <div class="used"><span class="lbl">Fills ${used.length} of ${FORMS.length} forms:</span>${used.map((x) => `<span class="zh">${x.name.length > 8 ? x.name.slice(0, 7) + '…' : x.name}</span>`).join('')}</div>
    <div class="spacer"></div>
    <div class="row"><button class="btn ghost" data-go="back">← Back</button><div class="spacer"></div>
    <button class="btn primary blue" style="width:auto;padding:0 28px" data-go="answer" ${ui.busy ? 'disabled' : ''}>OK ✓</button></div>
    <div class="kbd">press <span>Enter ↵</span></div>`;
  },

  review: () => {
    const d = S.app.draft;
    const group = (title, keys) => `<div class="group"><h3>${title}</h3><div class="facts">${keys.map((k) => `
      <div class="fact"><div class="grow"><div class="k zh">${FIELDS[k].label} · ${FIELDS[k].en}</div><div class="v zh">${esc(fmt(k, d[k]?.value))}</div></div>
      ${ORDER.includes(k) ? `<button class="edit" data-edit="${k}">Edit</button>` : ''}${source(d[k])}</div>`).join('')}</div></div>`;
    return `
    <h2>Check once, sign once.</h2>
    <p class="lead">Signing locks this exact version. All ${DOCS.length} documents are generated from it — nothing can change without your confirmation.</p>
    ${group('Company', ['company.name', 'company.address', 'company.capital', 'company.items'])}
    ${group('People', ['person.name', 'person.nationalId', 'director2.name', 'director2.nationalId', 'owner.name'])}
    <div class="err">${esc(ui.err)}</div>
    <button class="btn primary blue" data-go="sign" ${ui.busy ? 'disabled' : ''}>${ui.busy ? '<i class="spin"></i>' : ''}Sign & submit <span style="opacity:.6">↵</span></button>
    <div class="note">We'll text a one-time code to ${esc(S.phone)}. It signs a SHA-256 fingerprint of everything above.</div>`;
  },

  fixintro: () => {
    const dec = S.app.decision, f = FIELDS[dec.field];
    return `
    <div class="badge warn">!</div>
    <h2>One thing to fix.</h2>
    <div class="callout warn"><b>Officer's note · <span class="zh">${f.label}</span> ${f.en}</b><span>${esc(dec.note || 'Please check this field.')}</span></div>
    <p class="lead">Everything else stays exactly as you signed it. Only this field is reopened.</p>
    <div class="spacer"></div>
    <button class="btn primary" data-go="fix">Fix ${f.en.toLowerCase()} <span style="opacity:.6">↵</span></button>`;
  },

  done: () => {
    const a = S.app, sn = a.snapshot;
    const head = {
      submitted: ['wait', '✓', 'Submitted', `<span class="live"><i></i>Taipei City Commerce Office is reviewing</span>`],
      approved: ['ok', '✓', 'Approved', '<span class="lead">Your company registration is approved. 🎉</span>'],
      rejected: ['bad', '×', 'Not approved', `<span class="lead">${esc(a.decision?.note || '')}</span>`],
      revision: ['wait', '✓', 'Re-submitted', '<span class="live"><i></i>Waiting for the officer</span>'],
    }[a.status];
    return `
    <div class="badge ${head[0]}">${head[1]}</div>
    <div><h1>${head[2]}</h1><div style="margin-top:8px">${head[3]}</div></div>
    <div class="hash"><div class="l">SIGNED SNAPSHOT · v${sn.v} · ${esc(a.id)}</div><div class="h mono">sha256:${sn.hash}</div>
      <div class="s">${sn.prev ? `Replaces v${sn.v - 1} · ` : ''}Confirmed by SMS code to ${esc(sn.to)} · ${new Date(sn.signedAt).toLocaleString()}</div></div>
    <div class="group"><h3>${DOCS.length} documents generated</h3><div class="docs">${DOCS.map((f) => `
      <a href="/doc/${sn.v}/${f.id}" target="_blank"><div class="ic">📄</div><div><div class="n zh">${f.name}</div><div class="e">${f.en}</div></div><span class="open">Open ↗</span></a>`).join('')}</div></div>
    <div class="callout blue"><b>Next time: 0 questions</b><span>Your company details are saved to your verified profile for future forms.</span></div>`;
  },
};

// ---------- actions ----------
const ACTIONS = {
  async login() { ui.otp = { purpose: 'login', ...(await api('/api/login/send', {})) }; ui.step = 'otp'; ui.err = ''; render(); },
  fillCode() { $('qi').value = ui.otp.demoCode; ACTIONS.verify(); },
  async verify() {
    const code = $('qi').value.trim();
    ui.busy = true; ui.err = ''; render();
    try {
      if (ui.otp.purpose === 'login') {
        S = await api('/api/login/verify', { code });
        ui.qs = ORDER.filter((k) => S.app.missing.includes(k));
        ui.step = S.app.status === 'draft' ? 'known' : 'done';
      } else {
        S = await api('/api/sign/verify', { code });
        ui.step = 'done';
      }
      ui.draftVal = null;
    } catch (e) { ui.err = e.message; ui.draftVal = code; }
    ui.busy = false; render();
  },
  confirmKnown() { ui.step = ui.qs.length ? 'q' : 'review'; ui.i = 0; render(); },
  async answer() {
    const k = ui.qs[ui.i];
    let v = $('qi').value.trim();
    if (ASK[k].num) v = v.replace(/[,\s]/g, '');
    if (ASK[k].upper) v = v.toUpperCase();
    const err = validate(k, v);
    if (err) { ui.err = err; ui.draftVal = $('qi').value; return render(); }
    ui.busy = true;
    try { S = await api('/api/answer', { values: { [k]: v } }); } catch (e) { ui.err = Object.values(e.errors || {})[0] || e.message; ui.busy = false; return render(); }
    ui.busy = false; ui.err = ''; ui.draftVal = null;
    if (ui.returnTo) { ui.step = ui.returnTo; ui.returnTo = null; }
    else if (ui.i < ui.qs.length - 1) ui.i++;
    else ui.step = 'review';
    render();
  },
  back() {
    ui.err = ''; ui.draftVal = null;
    if (ui.returnTo) { ui.step = ui.returnTo; ui.returnTo = null; }
    else if (ui.i > 0) ui.i--;
    else ui.step = S.app.status === 'revision' ? 'fixintro' : 'known';
    render();
  },
  edit(k) { ui.qs = ui.qs.includes(k) ? ui.qs : ORDER; ui.i = ui.qs.indexOf(k); ui.step = 'q'; ui.returnTo = 'review'; render(); },
  fix() { ui.qs = [S.app.reopen]; ui.i = 0; ui.step = 'q'; render(); },
  async sign() {
    try { ui.otp = { purpose: 'sign', ...(await api('/api/sign/send', {})) }; ui.step = 'otp'; ui.err = ''; }
    catch (e) { ui.err = e.message; }
    render();
  },
};

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]')?.dataset.go;
  const ed = e.target.closest('[data-edit]')?.dataset.edit;
  if (go && !ui.busy) ACTIONS[go]();
  if (ed) ACTIONS.edit(ed);
});
document.addEventListener('submit', (e) => { e.preventDefault(); ui.step === 'otp' ? ACTIONS.verify() : ACTIONS.answer(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.tagName === 'INPUT' || ui.busy) return;
  const btn = document.querySelector('.btn.primary'); if (btn) btn.click();
});

// Live updates from the officer (approve / request change)
setInterval(async () => {
  if (!S?.app || !['submitted', 'revision'].includes(S.app.status) || ['q', 'review'].includes(ui.step)) return;
  const next = await api('/api/state');
  if (next.app?.status !== S.app.status || next.app?.snapshot?.v !== S.app.snapshot?.v) { S = next; render(); }
}, 2000);

S = await api('/api/state');
render();
