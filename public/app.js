import { FIELDS, FORMS, formBindings, paperFieldCount, validate, money, rocDate, docBody } from '/schema.js';
import { sourceLabel, errorLabel, evidenceKind, evidenceField, evidenceStatus } from '/labels.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The questions we ask, in conversational order. Anything else comes from verified sources.
const ASK = {
  'company.address': { q: '公司登記在哪裡？<br>Where will the company be registered?', ph: '例如 / e.g. 臺北市○○區○○路 1 號' },
  'company.capital': { q: '預計投入多少資本？<br>How much capital are you starting with?', ph: '1,000,000', pre: 'NT$', num: true },
  'owner.name': { q: '登記地址的建物所有人是誰？<br>Who owns the building at that address?', ph: '例如 / e.g. 王小明', hint: "系統會產生所有權人同意書。 We will prepare their consent letter." },
};
const ORDER = Object.keys(ASK);
const DOCS = FORMS.filter((f) => !f.onFile);
const EVIDENCE = { capital_verification: '會計師驗資證明 · Accountant capital verification', address_approval: '地址核准函 · Address approval', name_approval: '公司名稱核准函 · Company-name approval' };
const fmt = (k, v) => (k === 'company.capital' ? `NT$ ${money(v)}` : k === 'company.name' ? `${v}有限公司` : FIELDS[k]?.type === 'date' ? rocDate(v) : v);

let S = null;                       // server state (source of truth)
let ui = { step: 'welcome', qs: [], i: 0, err: '', busy: false, activity: null, readiness: null, returnTo: null };

const api = async (path, body) => {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error || '請求失敗 / Request failed'), j);
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
  const packet = !!S?.app && ['known', 'q', 'review', 'otp'].includes(s);
  $('app').className = packet ? 'with-packet' : '';
  $('app').innerHTML = `<section class="screen">${VIEWS[s]()}</section>${packet ? '<aside class="packet" id="packet"></aside>' : ''}`;
  if (packet) renderPacket();
  const inp = document.getElementById('qi'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }

}

// Live packet: every document re-rendered from the same facts as you type.
function liveData() {
  const d = Object.fromEntries(Object.entries(S.app.draft).map(([k, f]) => [k, f.value]));
  if (ui.step === 'q' && ui.live !== undefined) d[ui.qs[ui.i]] = ASK[ui.qs[ui.i]]?.num ? ui.live.replace(/[,\s]/g, '') : ui.live;
  return d;
}
function renderPacket() {
  const el = $('packet'); if (!el) return;
  const d = liveData(), cur = ui.step === 'q' ? ui.qs[ui.i] : null;
  const filled = FORMS.reduce((n, f) => n + formBindings(f).filter(({ key }) => d[key]).length, 0);
  const total = paperFieldCount();
  const typed = Object.values(S.app.draft).filter((f) => ['Applicant', 'Agent draft'].includes(f.source)).length;
  const wrap = (k, t) => `<mark class="${k === cur ? 'on' : t ? '' : 'empty'}">${t ? esc(t) : '　　　'}</mark>`;
  el.innerHTML = `
    <div class="ph"><b>文件即時帶入<br>Forms filling live</b><span>已填 <b>${filled}</b> / ${total} 欄 · 輸入 <b>${typed}</b> 次<br><b>${filled}</b> of ${total} filled · <b>${typed}</b> typed</span></div>
    <div class="pgrid">${DOCS.map((f) => `<div class="mini ${cur && f.fields.includes(cur) ? 'hit' : ''}"><div class="mt zh">${f.name} · ${f.en}</div><div class="doc zh">${docBody(f, d, wrap)}</div></div>`).join('')}</div>`;
}
document.addEventListener('input', (e) => { if (e.target.id === 'qi' && ui.step === 'q') { ui.live = e.target.value; renderPacket(); } });

const source = (f) => !f ? '' : f.source === 'Applicant' ? '<span class="tag you">你填寫 · You</span>'
  : f.source === 'Agent draft' ? '<span class="tag agent">✦ 代理草稿 · Agent draft</span>'
  : `<span class="tag ok">${esc(sourceLabel(f.source))}</span>`;

function evidenceUploads() {
  const a = S.app;
  return `<div class="group"><h3>佐證附件 · Supporting evidence</h3>
    <p class="lead" style="font-size:14px;margin-bottom:12px">上傳三份外部證明；展示時可下載樣張再上傳。<br>Upload three supporting PDFs, or use the demo samples.</p>
    <div class="facts">${Object.entries(EVIDENCE).map(([kind, title]) => {
      const attachment = (a.attachments || []).find((item) => item.kind === kind);
      return `<div class="fact"><div class="grow"><label class="k" for="evidence-${kind}">${title}</label>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin:7px 0"><a class="edit" href="/api/mock-attachments/${kind}" target="_blank" rel="noopener">下載樣張 · Download PDF ↗</a>${attachment ? `<a class="edit" href="${esc(attachment.url)}" target="_blank" rel="noopener">已上傳 · Uploaded PDF ✓</a>` : ''}</div>
        <input id="evidence-${kind}" data-upload="${kind}" type="file" accept=".pdf,application/pdf" aria-label="上傳 / Upload ${title}" style="font:12px Inter,sans-serif;max-width:100%" ${ui.busy || a.status === 'approved' ? 'disabled' : ''}>
      </div></div>`;
    }).join('')}</div>
    <div class="note" style="margin-top:10px">每份限 10 MB / Up to 10 MB each · ${ui.activity === 'upload' ? '上傳中 / Uploading…' : '選取 PDF 上傳 / Select a PDF.'}</div>
  </div>`;
}

const reviewValue = (value) => value?.on_or_before ? `不晚於 / On or before ${value.on_or_before}`
  : value == null ? '未擷取 / Not extracted' : ({ provided: '已提供 · Provided', approved: '已核准 · Approved', rejected: '已駁回 · Rejected', 'valid issue date': '有效日期 · Valid date' }[value] ?? (typeof value === 'object' ? JSON.stringify(value) : String(value)));

function selfReviewReport() {
  const report = S.app.selfReview;
  if (!report) return `<div class="callout blue"><b>送出前自我核對 · Review before submitting</b><span>比對公司名稱、資本額、地址與日期，並顯示來源。<br>Compare company, capital, address, and dates against the uploaded evidence.</span></div>`;
  const ready = report.current && report.recommendation === 'ready_to_submit';
  const title = !report.current ? '資料已更新，請重新核對 · Details changed; review again'
    : ready ? '資料核對完成，可進入最後確認 · Ready for final confirmation'
    : report.recommendation === 'unknown' ? '尚無法完成核對 · Review incomplete' : '有項目需要處理 · Attention needed';
  return `<section class="self-review" aria-live="polite">
    <div class="callout ${ready ? 'blue' : 'warn'}"><b>${title}</b><span>這是送件準備檢查，不是政府核准。<br>This is a submission-readiness check, not government approval.</span></div>
    <div class="group"><h3>規則比對與來源 · Rule checks and evidence</h3>
      <div class="review-checks">${(report.checks || []).slice().sort((a, b) => Number(a.status === 'passed') - Number(b.status === 'passed')).map((check) => `<article class="review-check">
        <div class="review-check-head"><div><div class="note">${esc(evidenceKind(check.kind))}</div><strong>${esc(evidenceField(check.field))}</strong></div><span class="tag ${check.status === 'passed' ? 'ok' : 'warn'}">${esc(evidenceStatus(check.status))}</span></div>
        <dl class="review-values"><div><dt>預期資料 · Expected</dt><dd>${esc(reviewValue(check.expected))}</dd></div><div><dt>文件內容 · Observed</dt><dd>${esc(reviewValue(check.actual))}</dd></div></dl>
        ${check.source?.url ? `<a class="edit" href="${esc(check.source.url)}" target="_blank" rel="noopener">查看來源 · View source${check.source.page ? ` · p.${esc(check.source.page)}` : ''} ↗</a>` : '<div class="note">未取得文件來源 · No document evidence</div>'}
        ${check.source?.quote ? `<blockquote>${esc(check.source.quote)}</blockquote>` : ''}
      </article>`).join('') || '<p class="note">尚無核對結果 · No checks available.</p>'}</div>
    </div>
    ${(report.extraction || []).length ? `<div class="group"><h3>文件擷取狀態 · Extraction status</h3><div class="facts">${report.extraction.map((item) => {
      const status = { complete: '已擷取 · Extracted', partial: '部分待核對 · Partly extracted', unavailable: '無法擷取 · Unavailable', unknown: '待人工核對 · Needs review' }[item.status] || item.status;
      const method = item.mode === 'deterministic' ? '已知格式 · Known format' : ['llm', 'semantic'].includes(item.mode) ? '語意擷取 · Semantic extraction' : '擷取方式未確認 · Method unconfirmed';
      return `<div class="fact"><div class="grow"><div class="k">${esc(evidenceKind(item.kind))}</div><div class="v">${esc(status)}</div><div class="note" style="text-align:left">${esc(method)}</div></div></div>`;
    }).join('')}</div></div>` : ''}
    <div class="callout ${report.explanation?.available ? 'blue' : 'warn'}"><b>語意說明 · Semantic explanation</b>
      <span>${report.explanation?.available && report.explanation.text ? esc(report.explanation.text) : '語意說明目前無法使用；上方只列實際完成的規則核對。<br>Semantic explanation is unavailable. Only completed rule checks are shown above.'}</span>
    </div>
  </section>`;
}

const VIEWS = {
  welcome: () => `
    <div class="eyebrow zh">臺北市商業處 · 有限公司設立登記<br>Taipei Commerce Office · Company registration</div>
    <h1>${DOCS.length + 1} 份表單，一次完成。<br>${DOCS.length + 1} forms. One conversation.</h1>
    <p class="lead">資料只填一次，帶入整套文件，確認後一次送出。<br>Answer once, fill every document, then confirm and submit.</p>
    <div class="steps">
      <div><b>1</b>確認既有資料 · Confirm known details</div>
      <div><b>2</b>回答 ${ORDER.length} 個問題 · Answer ${ORDER.length} questions</div>
      <div><b>3</b>上傳與自我核對 · Upload and review</div>
      <div><b>4</b>簡訊代碼確認 · Confirm with a text code</div>
    </div>
    <div class="spacer"></div>
    <div class="err">${esc(ui.err)}</div>
    <button class="btn primary" data-go="login" ${ui.busy ? 'disabled' : ''}>開始 · Get started <span style="opacity:.6">↵</span></button>
    <div class="note">驗證碼將傳至已驗證手機 ${esc(S.phone)}。<br>A code will be sent to your verified phone.</div>`,

  otp: () => `
    <div class="eyebrow">${ui.otp.purpose === 'sign' ? '最後一步 · Last step' : '確認身份 · Verify it’s you'}</div>
    <h2>${ui.otp.purpose === 'sign' ? '輸入代碼，確認送出。<br>Enter the code to sign and submit.' : '輸入簡訊驗證碼。<br>Enter your text code.'}</h2>
    <p class="lead">已傳送至 / Sent to ${esc(ui.otp.to)}${ui.otp.purpose === 'sign' ? ` — 確認資料指紋 / confirms fingerprint <span class="mono" style="font-size:13px">${ui.otp.hash.slice(0, 12)}…</span>` : ''}.</p>
    <form class="field" id="qf"><input id="qi" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" style="letter-spacing:10px" value="${esc(ui.draftVal ?? '')}"></form>
    <div class="err">${ui.err ? '⚠ ' + esc(ui.err) : ''}</div>
    <div class="sms" data-go="fillCode"><b>📱 簡訊 · 剛剛 / Messages · now</b><span>驗證碼 / Your code: <b>${ui.otp.demoCode}</b> · 點選填入 / Tap to fill.</span></div>
    <div class="spacer"></div>
    <button class="btn primary blue" data-go="verify" ${ui.busy ? 'disabled' : ''}>${ui.busy ? '<i class="spin"></i>' : ''}${ui.otp.purpose === 'sign' ? '確認送出 · Sign & submit' : '繼續 · Continue'} <span style="opacity:.6">↵</span></button>`,

  known: () => {
    const d = S.app.draft;
    const keys = ['person.name', 'person.nationalId', 'person.phone', 'person.address', 'company.name', 'company.items', 'company.articles_date', ...ORDER.filter((k) => !ui.qs.includes(k))];
    return `
    <div class="eyebrow">歡迎回來 / Welcome back, ${esc(d['person.name'].value)}</div>
    <h2>確認已知資料。<br>Check your saved details.</h2>
    <p class="lead" style="font-size:14px">本次為一人公司：申請人、負責人與唯一董事是同一人，各角色沿用同一份身份資料。<br>One person is the applicant, representative, and sole director. Enter their identity once.</p>
    <div class="facts">${keys.filter((k) => d[k]).map((k) => `
      <div class="fact"><div class="check">✓</div><div class="grow"><div class="k zh">${FIELDS[k].label} · ${FIELDS[k].en}</div><div class="v zh">${esc(fmt(k, d[k].value))}</div></div>${source(d[k])}</div>`).join('')}
    </div>
    <div class="spacer"></div>
    <button class="btn primary" data-go="confirmKnown">確認使用 · Use these details <span style="opacity:.6">↵</span></button>
    <div class="note">沿用至全部 ${DOCS.length + 1} 份表單，不必重填。<br>Reused across all ${DOCS.length + 1} forms.</div>`;
  },

  q: () => {
    const k = ui.qs[ui.i], a = ASK[k], f = FIELDS[k], cur = S.app.draft[k];
    const val = ui.draftVal ?? (cur?.value ?? '');
    const used = FORMS.filter((x) => x.fields.includes(k));
    return `
    <div class="qnum">${ui.qs.length > 1 ? `第 ${ui.i + 1} / ${ui.qs.length} 題 · ${ui.i + 1} of ${ui.qs.length} →` : '修正一項 · One fix →'} ${cur?.source === 'Agent draft' ? '<span class="tag agent">✦ 請確認代理草稿 · Check agent draft</span>' : ''}</div>
    <h2>${a.q}</h2>
    <div class="qlabel zh">${f.label} · ${f.en}</div>
    <form class="field" id="qf">${a.pre ? `<span class="pre">${a.pre}</span>` : ''}<input id="qi" autocomplete="off" placeholder="${a.ph}" value="${esc(a.num && val ? money(val) : val)}"></form>
    <div class="err">${ui.err ? '⚠ ' + esc(ui.err) : a.hint ? `<span style="color:var(--ink3)">${a.hint}</span>` : ''}</div>
    <div class="used"><span class="lbl">帶入 ${used.length}/${FORMS.length} 份 · Fills ${used.length}/${FORMS.length} forms:</span>${used.map((x) => `<span class="zh">${x.name.length > 8 ? x.name.slice(0, 7) + '…' : x.name}</span>`).join('')}</div>
    <div class="spacer"></div>
    <div class="row"><button class="btn ghost" data-go="back">← 返回 · Back</button><div class="spacer"></div>
    <button class="btn primary blue" style="width:auto;padding:0 28px" data-go="answer" ${ui.busy ? 'disabled' : ''}>確認 · OK ✓</button></div>
    <div class="kbd">按下 / press <span>Enter ↵</span></div>`;
  },

  review: () => {
    const d = S.app.draft;
    const group = (title, keys) => `<div class="group"><h3>${title}</h3><div class="facts">${keys.map((k) => `
      <div class="fact"><div class="grow"><div class="k zh">${FIELDS[k].label} · ${FIELDS[k].en}</div><div class="v zh">${esc(fmt(k, d[k]?.value))}</div></div>
      ${ORDER.includes(k) ? `<button class="edit" data-edit="${k}">修改 · Edit</button>` : ''}${source(d[k])}</div>`).join('')}</div></div>`;
    return `
    <h2>送出前，先核對。<br>Review before you submit.</h2>
    <p class="lead">確認資料、上傳佐證，再查看送件準備結果。最後以代碼確認，產生 ${DOCS.length} 份文件。<br>Check your details and evidence before confirming the final ${DOCS.length} documents.</p>
    ${group('公司 · Company', ['company.name', 'company.address', 'company.capital', 'company.items', 'company.articles_date'])}
    ${group('相關人員 · People', ['person.name', 'person.nationalId', 'owner.name'])}
    ${evidenceUploads()}
    ${ui.readiness?.available === false ? '<div class="note">一般文件語意擷取尚未啟用；已知格式的展示文件仍可規則核對。<br>General semantic extraction is unavailable; known demo formats can still be checked by rules.</div>' : ''}
    <button class="btn primary" data-go="selfReview" ${ui.busy ? 'disabled' : ''}>${ui.activity === 'self-review' ? '<i class="spin"></i>核對中 · Reviewing…' : '執行自我核對 · Run self-review'}</button>
    ${selfReviewReport()}
    <div class="err">${esc(ui.err)}</div>
    <button class="btn primary blue" data-go="sign" ${ui.busy || !S.app.selfReview?.current || S.app.selfReview?.recommendation !== 'ready_to_submit' ? 'disabled' : ''}>${ui.busy ? '<i class="spin"></i>' : ''}確認送出 · Sign & submit <span style="opacity:.6">↵</span></button>
    <div class="note">自我核對完成後，以 ${esc(S.phone)} 的代碼確認送出。<br>After review, confirm submission with a text code. No government filing occurs in this demo.</div>`;
  },

  fixintro: () => {
    const dec = S.app.decision, f = FIELDS[dec.field];
    return `
    <div class="badge warn">!</div>
    <h2>有一項需要修正。<br>One thing to fix.</h2>
    <div class="callout warn"><b>審查意見 / Officer note · <span class="zh">${f.label}</span> ${f.en}</b><span>${esc(dec.note || '請確認此欄位。 Please check this field.')}</span></div>
    <p class="lead">只重新開放此欄位，其餘資料維持已確認版本。<br>Only this field is reopened; everything else stays as signed.</p>
    <div class="spacer"></div>
    <button class="btn primary" data-go="fix">修正 ${f.label} · Fix ${f.en.replace(/\s*\(.*\)/, '').toLowerCase()} <span style="opacity:.6">↵</span></button>`;
  },

  done: () => {
    const a = S.app, sn = a.snapshot;
    const head = {
      submitted: ['wait', '✓', '已送出 · Submitted', `<span class="live"><i></i>展示審查中 · Demo review in progress</span>`],
      approved: ['ok', '✓', '展示審查通過 · Demo approved', '<span class="lead">展示流程已完成，尚未送交政府。<br>Demo review complete. No government filing has occurred.</span>'],
      rejected: ['bad', '×', '未核准 · Not approved', `<span class="lead">${esc(a.decision?.note || '')}</span>`],
      revision: ['wait', '✓', '已重新送出 · Re-submitted', '<span class="live"><i></i>等待審查 · Waiting for review</span>'],
    }[a.status];
    return `
    <div class="badge ${head[0]}">${head[1]}</div>
    <div><h1>${head[2]}</h1><div style="margin-top:8px">${head[3]}</div></div>
    <div class="hash"><div class="l">已確認版本 / SIGNED SNAPSHOT · v${sn.v} · ${esc(a.id)}</div><div class="h mono">sha256:${sn.hash}</div>
      <div class="s">${sn.prev ? `取代 / Replaces v${sn.v - 1} · ` : ''}簡訊確認 / Confirmed by SMS to ${esc(sn.to)} · ${new Date(sn.signedAt).toLocaleString()}</div></div>
    <div class="group"><h3>${DOCS.length} 份文件已產生 · Documents generated</h3><div class="docs">${DOCS.map((f) => `
      <a href="/doc/${sn.v}/${f.id}" target="_blank"><div class="ic">📄</div><div><div class="n zh">${f.name}</div><div class="e">${f.en}</div></div><span class="open">開啟 Open ↗</span></a>`).join('')}</div></div>
    ${evidenceUploads()}
    <div class="err" role="alert">${esc(ui.err)}</div>
    <div class="callout blue"><b>下次免重填 · Next time: 0 questions</b><span>公司資料已儲存，下次填表可沿用。<br>Your saved company details can be reused in future forms.</span></div>`;
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
  confirmKnown() { ui.live = undefined; ui.step = ui.qs.length ? 'q' : 'review'; ui.i = 0; render(); },
  async answer() {
    const k = ui.qs[ui.i];
    let v = $('qi').value.trim();
    if (ASK[k].num) v = v.replace(/[,\s]/g, '');
    if (ASK[k].upper) v = v.toUpperCase();
    const err = validate(k, v);
    if (err) { ui.err = errorLabel(err); ui.draftVal = $('qi').value; return render(); }
    ui.busy = true;
    try { S = await api('/api/answer', { values: { [k]: v } }); } catch (e) { ui.err = Object.values(e.errors || {})[0] || e.message; ui.busy = false; return render(); }
    ui.busy = false; ui.err = ''; ui.draftVal = null; ui.live = undefined;
    if (ui.returnTo) { ui.step = ui.returnTo; ui.returnTo = null; }
    else if (ui.i < ui.qs.length - 1) ui.i++;
    else ui.step = 'review';
    render();
  },
  back() { ui.live = undefined;
    ui.err = ''; ui.draftVal = null;
    if (ui.returnTo) { ui.step = ui.returnTo; ui.returnTo = null; }
    else if (ui.i > 0) ui.i--;
    else ui.step = S.app.status === 'revision' ? 'fixintro' : 'known';
    render();
  },
  edit(k) { ui.live = undefined; ui.qs = ui.qs.includes(k) ? ui.qs : ORDER; ui.i = ui.qs.indexOf(k); ui.step = 'q'; ui.returnTo = 'review'; render(); },
  fix() { ui.live = undefined; ui.qs = [S.app.reopen]; ui.i = 0; ui.step = 'q'; render(); },
  async selfReview() {
    ui.busy = true; ui.activity = 'self-review'; ui.err = ''; render();
    try { await api('/api/self-review', {}); S = await api('/api/state'); }
    catch (error) { ui.err = error.message; }
    finally { ui.busy = false; ui.activity = null; render(); }
    if (S.app.selfReview) document.querySelector('.self-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  async sign() {
    if (!S.app.selfReview?.current || S.app.selfReview.recommendation !== 'ready_to_submit') return;
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
document.addEventListener('change', async (event) => {
  const kind = event.target.dataset.upload;
  if (!kind || ui.busy || !event.target.files?.length) return;
  const file = event.target.files[0];
  if (file.size > 10 * 1024 * 1024) { ui.err = '請選擇 10 MB 以下的 PDF。 Choose a PDF up to 10 MB.'; return render(); }
  ui.busy = true; ui.activity = 'upload'; ui.err = ''; render();
  try {
    const response = await fetch(`/api/attachments?kind=${encodeURIComponent(kind)}`, { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: file });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '上傳失敗，請重試。 Upload failed. Please try again.');
    S = await api('/api/state');
  } catch (error) { ui.err = error.message; }
  finally { ui.busy = false; ui.activity = null; render(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.tagName === 'INPUT' || e.target.closest('button, a') || ui.busy) return;
  e.preventDefault(); // stop the same keystroke from submitting the next screen's input
  const btn = document.querySelector('[data-go="sign"]:not([disabled])') || document.querySelector('.btn.primary:not([disabled])'); if (btn) btn.click();
});

// Live updates from the officer (approve / request change)
setInterval(async () => {
  if (!S?.app || !['submitted', 'revision'].includes(S.app.status) || ['q', 'review'].includes(ui.step)) return;
  const next = await api('/api/state');
  if (next.app?.status !== S.app.status || next.app?.snapshot?.v !== S.app.snapshot?.v) { S = next; render(); }
}, 2000);

S = await api('/api/state');
try { ui.readiness = await api('/api/self-review/readiness'); } catch { ui.readiness = null; }
render();
