import { FIELDS, FORMS, formBindings, validate, money, rocDate, docBody } from '/schema.js';
import { sourceLabel, errorLabel, evidenceKind, evidenceField, evidenceStatus } from '/labels.js';
import { t, mountLanguageSwitch } from '/language.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The questions we ask, in conversational order. Anything else comes from verified sources.
const ASK = {
  'company.address': { q: ['公司登記在哪裡？', 'Where will the company be registered?'], ph: '例如 / e.g. 臺北市○○區○○路 1 號' },
  'company.capital': { q: ['預計投入多少資本？', 'How much capital are you starting with?'], ph: '1,000,000', pre: 'NT$', num: true },
  'owner.name': { q: ['登記地址的建物所有人是誰？', 'Who owns the building at that address?'], ph: '例如 / e.g. 王小明', hint: ['系統會產生所有權人同意書。', 'We will prepare their consent letter.'] },
};
const ORDER = Object.keys(ASK);
const DOCS = FORMS.filter((f) => !f.onFile);
// One story everywhere: N required forms = generated + already on file; you answer N_Q questions.
const N_FORMS = FORMS.length, N_GEN = DOCS.length, N_FILE = N_FORMS - N_GEN, N_Q = ORDER.length;
const EVIDENCE = { capital_verification: ['會計師驗資證明', 'Capital audit report'], address_approval: ['地址預查核准函', 'Address precheck'], name_approval: ['名稱預查核准函', 'Name reservation'] };
const KINDS = Object.keys(EVIDENCE);
// Marked sample PDFs are a rehearsal aid: only offered with ?demo=1 (the extension drawer opens with it).
const DEMO_SAMPLES = new URLSearchParams(location.search).get('demo') === '1';
const GOV_SOURCE = /MOI|Household|SMS|Name reservation|預查/;
const fmt = (k, v) => (k === 'company.capital' ? `NT$ ${money(v)}` : k === 'company.name' ? `${v}有限公司` : FIELDS[k]?.type === 'date' ? rocDate(v) : v);

const I = {
  check: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  doc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>',
  upload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
  send: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>',
  msg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1L4.5 21l4.2-2.2c1 .3 2.1.4 3.3.4 5.5 0 10-3.6 10-8.1S17.5 3 12 3z"/></svg>',
  alert: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9.5"/></svg>',
};

let S = null;                       // server state (source of truth)
let ui = { step: 'welcome', qs: [], i: 0, err: '', busy: false, activity: null, readiness: null, returnTo: null, shownFilled: null, factsOpen: false, uploading: null };

const api = async (path, body) => {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error || '請求失敗 / Request failed'), j);
  return j;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- derive which screen we are on ----------
function screen() {
  const st = S?.app?.status;
  if (st && st !== 'draft' && !['q', 'review', 'otp', 'signing'].includes(ui.step)) return st === 'revision' ? 'fixintro' : 'done';
  return ui.step;
}
const progress = { welcome: 0, otp: 6, known: 12, q: null, review: 92, signing: 97, done: 100, fixintro: 70 };

function render() {
  const s = screen();
  const pct = s === 'q' ? 15 + (75 * ui.i) / Math.max(ui.qs.length, 1) : progress[s];
  $('progress').style.width = pct + '%';
  const packet = !!S?.app && ['known', 'q'].includes(s);
  $('app').className = `${packet ? 'with-packet' : ''} s-${s}`;
  $('app').innerHTML = `<section class="screen">${VIEWS[s]()}</section>${packet ? '<aside class="packet" id="packet"></aside>' : ''}`;
  if (packet) renderPacket();
  const inp = $('qi'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  if (s === 'otp') paintCode();
}

// ---------- live data preview: every document re-rendered from the same facts as you type ----------
function liveData() {
  const d = Object.fromEntries(Object.entries(S.app.draft).map(([k, f]) => [k, f.value]));
  if (ui.step === 'q' && ui.live !== undefined) d[ui.qs[ui.i]] = ASK[ui.qs[ui.i]]?.num ? ui.live.replace(/[,\s]/g, '') : ui.live;
  return d;
}
function renderPacket() {
  const el = $('packet'); if (!el) return;
  const d = liveData(), cur = ui.step === 'q' ? ui.qs[ui.i] : null;
  const filled = DOCS.reduce((n, f) => n + formBindings(f).filter(({ key }) => d[key]).length, 0);
  const total = DOCS.reduce((n, f) => n + formBindings(f).length, 0);
  const wrap = (k, v) => `<mark class="${k === cur && v ? 'on' : v ? '' : 'empty'}">${v ? esc(v) : '　　　'}</mark>`;
  const from = ui.shownFilled ?? filled;
  el.innerHTML = `
    <div class="ph"><div><b>${t('資料預覽', 'Data preview')}</b><small>${t('預覽，非正式 PDF 版面', 'Preview — not the official PDF layout')}</small></div>
      <div class="count"><b><span id="pcount">${from}</span> / ${total}</b><small>${t(`${N_GEN} 份表單欄位已填`, `fields filled in ${N_GEN} forms`)}</small></div></div>
    <div class="pgrid">${DOCS.map((f) => `<div class="mini ${cur && f.fields.includes(cur) ? 'hit' : ''}"><div class="mt zh">${t(f.name, f.en)}</div><div class="doc zh">${docBody(f, d, wrap)}</div></div>`).join('')}</div>`;
  if (from !== filled) countUp($('pcount'), from, filled);
  ui.shownFilled = filled;
}
function countUp(el, from, to) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) { if (el) el.textContent = to; return; }
  const t0 = performance.now(), dur = 450;
  const tick = (now) => { const p = Math.min(1, (now - t0) / dur); el.textContent = Math.round(from + (to - from) * (1 - (1 - p) ** 3)); if (p < 1 && el.isConnected) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
document.addEventListener('input', (e) => {
  if (e.target.id !== 'qi') return;
  if (ui.step === 'q') {
    if (ASK[ui.qs[ui.i]]?.num) { const digits = e.target.value.replace(/\D/g, ''); e.target.value = digits ? money(digits) : ''; }
    ui.live = e.target.value; renderPacket();
  } else if (ui.step === 'otp') {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); paintCode();
    if (e.target.value.length === 6 && !ui.busy) setTimeout(() => $('qi')?.value.length === 6 && !ui.busy && ACTIONS.verify(), 180);
  }
});

const source = (f) => {
  if (!f) return '';
  if (f.source === 'Applicant') return `<span class="tag you">✎ ${t('你填寫', 'You typed')}</span>`;
  if (f.source === 'Agent draft') return `<span class="tag you">✦ ${t('代理草稿，請確認', 'Agent draft — check')}</span>`;
  if (GOV_SOURCE.test(f.source)) return `<span class="tag ok">${I.check}${esc(sourceLabel(f.source))}</span>`;
  return `<span class="tag sys">${esc(sourceLabel(f.source))}</span>`;
};

// ---------- SMS / code boxes ----------
function paintCode() {
  const v = $('qi')?.value ?? '';
  document.querySelectorAll('.code .cell').forEach((c, i) => {
    const had = c.textContent; c.textContent = v[i] ?? '';
    c.classList.toggle('on', !!v[i]); c.classList.toggle('cur', i === v.length);
    if (v[i] && had !== v[i]) { c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
  });
}

// ---------- evidence ----------
const attachmentFor = (kind) => (S.app.attachments || []).find((item) => item.kind === kind);
const uploadedCount = () => KINDS.filter(attachmentFor).length;
const missingKinds = () => KINDS.filter((kind) => !attachmentFor(kind));
async function uploadFile(kind, file) {
  if (file.size > 10 * 1024 * 1024) { ui.err = t('請選擇 10 MB 以下的 PDF。', 'Choose a PDF up to 10 MB.'); return render(); }
  const response = await fetch(`/api/attachments?kind=${encodeURIComponent(kind)}`, { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: file });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || t('上傳失敗，請重試。', 'Upload failed. Please try again.'));
}
async function withUpload(kinds, getFile) {
  ui.busy = true; ui.activity = 'upload'; ui.err = '';
  try {
    for (const kind of kinds) { ui.uploading = kind; render(); await uploadFile(kind, await getFile(kind)); S = await api('/api/state'); }
  } catch (error) { ui.err = error.message; }
  finally { ui.busy = false; ui.activity = null; ui.uploading = null; render(); }
}

function evidenceTiles() {
  const a = S.app, n = uploadedCount(), locked = ui.busy || a.status === 'approved';
  return `<div class="group evidence">
    <div class="ghead"><h3>${t('佐證文件', 'Evidence')} <span class="cnt ${n === KINDS.length ? 'ok' : ''}">${n}/${KINDS.length}</span></h3>
      ${DEMO_SAMPLES && ['draft', 'revision'].includes(a.status) && n < KINDS.length ? `<button class="btn outline sm" data-go="loadDemoEvidence" ${locked ? 'disabled' : ''}>${t('使用示範文件', 'Use demo samples')}</button>` : ''}</div>
    <div class="tiles">${KINDS.map((kind) => {
      const title = t(...EVIDENCE[kind]), att = attachmentFor(kind), busy = ui.uploading === kind;
      return `<label class="tile ${att ? 'ok' : ''} ${busy ? 'busy' : ''}" for="evidence-${kind}" data-drop="${kind}">
        <span class="ti">${busy ? '<i class="spin dark"></i>' : att ? I.check : I.upload}</span>
        <span class="tt"><b>${title}</b><small>${busy ? t('上傳中…', 'Uploading…') : att ? t('已上傳', 'Uploaded') : t('拖曳 PDF 或點選上傳', 'Drop a PDF or click to upload')}</small></span>
        ${att ? `<a class="edit" href="${esc(att.url)}" target="_blank" rel="noopener">${t('檢視', 'View')} ↗</a><span class="edit">${t('更換', 'Replace')}</span>` : ''}
        <input class="vh" id="evidence-${kind}" data-upload="${kind}" type="file" accept=".pdf,application/pdf" ${locked ? 'disabled' : ''}>
      </label>`;
    }).join('')}</div>
  </div>`;
}

const reviewValue = (value) => value?.on_or_before ? `${t('不晚於', 'On or before')} ${value.on_or_before}`
  : value == null ? t('未擷取', 'Not extracted') : ({ provided: t('已提供', 'Provided'), approved: t('已核准', 'Approved'), rejected: t('已駁回', 'Rejected'), 'valid issue date': t('有效日期', 'Valid date') }[value] ?? (typeof value === 'object' ? JSON.stringify(value) : String(value)));
// LLM text sometimes echoes internal tokens (ready_to_submit, document.issued_on): never show them raw.
const TOKENS = () => ({ ready_to_submit: t('可送出', 'ready to submit'), needs_attention: t('需處理', 'needs attention'), request_documents: t('需補件', 'documents needed'), needs_confirmation: t('待確認', 'needs confirmation') });
const plain = (text) => String(text || '').replace(/\b[a-z]{2,}(?:[_.][a-z][a-z0-9]+)+\b/g, (m) => TOKENS()[m] ?? m.split(/[_.]/).slice(-2).join(' ')).replace(/\s+/g, ' ').trim();

function checkDetails(report) {
  return `<div class="review-checks">${(report.checks || []).slice().sort((a, b) => Number(a.status === 'passed') - Number(b.status === 'passed')).map((check) => `<article class="review-check">
      <div class="review-check-head"><div><div class="note">${esc(evidenceKind(check.kind))}</div><strong>${esc(evidenceField(check.field))}</strong></div><span class="tag ${check.status === 'passed' ? 'ok' : 'warn'}">${esc(evidenceStatus(check.status))}</span></div>
      <dl class="review-values"><div><dt>${t('預期資料', 'Expected')}</dt><dd>${esc(reviewValue(check.expected))}</dd></div><div><dt>${t('文件內容', 'Observed')}</dt><dd>${esc(reviewValue(check.actual))}</dd></div></dl>
      ${check.source?.url ? `<a class="edit" href="${esc(check.source.url)}" target="_blank" rel="noopener">${t('查看來源', 'View source')}${check.source.page ? ` · p.${esc(check.source.page)}` : ''} ↗</a>` : `<div class="note">${t('未取得文件來源', 'No document evidence')}</div>`}
      ${check.source?.quote ? `<blockquote>${esc(check.source.quote)}</blockquote>` : ''}
    </article>`).join('') || `<p class="note">${t('尚無核對結果', 'No checks available.')}</p>`}</div>
    ${(report.extraction || []).length ? `<div class="extr">${report.extraction.map((item) => {
      const status = { complete: t('已擷取', 'Extracted'), partial: t('部分待核對', 'Partly extracted'), unavailable: t('無法擷取', 'Unavailable'), unknown: t('待人工核對', 'Needs review') }[item.status] || item.status;
      return `<span class="tag ${item.status === 'complete' ? 'sys' : 'warn'}">${esc(evidenceKind(item.kind))}: ${esc(status)}</span>`;
    }).join('')}</div>` : ''}`;
}

function selfReviewCard() {
  const report = S.app.selfReview, ready3 = uploadedCount() === KINDS.length, running = ui.activity === 'self-review';
  const runBtn = (label) => `<button class="btn primary" data-go="selfReview" ${ui.busy || !ready3 ? 'disabled' : ''}>${running ? `<i class="spin"></i>${t(`核對 ${KINDS.length} 份文件中…`, `Checking ${KINDS.length} documents…`)}` : label}</button>`;
  const unavailable = ui.readiness?.available === false ? `<div class="note left">${t('一般文件語意擷取尚未啟用；已知格式的展示文件仍可規則核對。', 'General semantic extraction is unavailable; known demo formats can still be checked by rules.')}</div>` : '';
  if (!report || !report.current || running) {
    const stale = report && !report.current;
    return `<div class="rcard ${stale ? 'warn' : 'idle'}">
      <div class="rhead"><span class="ri">${stale ? I.alert : I.doc}</span><div><b>${stale ? t('資料已更新，請重新核對', 'Details changed — check again') : t('送出前自我核對', 'Self-review before you submit')}</b>
        <small>${ready3 ? t('比對公司名稱、資本額、地址與日期。', 'Compares company, capital, address and dates with your documents.') : t(`先上傳 ${KINDS.length} 份文件。`, `Upload the ${KINDS.length} documents first.`)}</small></div></div>
      ${runBtn(t('執行自我核對', 'Run self-review'))}${unavailable}</div>`;
  }
  const checks = report.checks || [], passed = checks.filter((c) => c.status === 'passed').length, ok = report.recommendation === 'ready_to_submit';
  const docs = new Set(checks.map((c) => c.kind)).size || KINDS.length;
  const expl = report.explanation?.available && report.explanation.text ? plain(report.explanation.text) : '';
  return `<section class="self-review rcard ${ok ? 'ok' : 'warn'}" aria-live="polite">
    <div class="rhead"><span class="ri">${ok ? I.check : I.alert}</span><div>
      <b>${ok ? t(`${passed}/${checks.length} 項核對通過`, `${passed}/${checks.length} checks passed`) : t(`${checks.length - passed} 項需要處理`, `${checks.length - passed} need attention`)}</b>
      <small>${t(`對照 ${docs} 份文件`, `against ${docs} documents`)} · ${t('送件準備檢查，非政府核准', 'readiness check, not government approval')}</small></div></div>
    ${expl ? `<p class="expl">${esc(expl)}</p>` : ''}
    <details class="checks-detail" ${ok ? '' : 'open'}><summary>${t('查看核對依據', 'Show checks')}</summary>${checkDetails(report)}</details>
    <button class="edit rerun" data-go="selfReview" ${ui.busy ? 'disabled' : ''}>${t('重新核對', 'Run again')}</button>
  </section>`;
}

const VIEWS = {
  welcome: () => `
    <div class="eyebrow zh">${t('臺北市商業處 · 有限公司設立登記', 'Taipei Commerce Office · Company registration')}</div>
    <h1>${t(`${N_FORMS} 份表單，只答 ${N_Q} 題。`, `${N_FORMS} forms. You answer ${N_Q} questions.`, '<br>')}</h1>
    <div class="stats">
      <div class="stat blue"><b>${N_GEN}</b><span>${t('份自動產生', 'generated for you')}</span></div>
      <div class="stat green"><b>${N_FILE}</b><span>${t('份已存檔（名稱預查）', 'already on file (name reservation)')}</span></div>
      <div class="stat amber"><b>${N_Q}</b><span>${t('題由你回答', 'questions for you')}</span></div>
    </div>
    <div class="steps">
      <div><b>1</b>${t('確認既有資料', 'Confirm what we already know')}</div>
      <div><b>2</b>${t(`回答 ${N_Q} 題`, `Answer ${N_Q} questions`)}</div>
      <div><b>3</b>${t('上傳文件並自我核對', 'Upload documents and self-check')}</div>
      <div><b>4</b>${t('以代碼確認送出', 'Confirm once with a code')}</div>
    </div>
    <div class="spacer"></div>
    <div class="err">${esc(ui.err)}</div>
    <button class="btn primary" data-go="login" ${ui.busy ? 'disabled' : ''}>${t('開始', 'Get started')} <span class="k">↵</span></button>
    <div class="note">${t('以展示代碼確認，不會傳送簡訊。', 'You confirm with a demo code — no SMS is sent.')}</div>`,

  otp: () => `
    <div class="notif sms" data-go="fillCode" role="button" tabindex="0" aria-label="${t('點選填入代碼', 'Tap to fill the code')}">
      <span class="ni">${I.msg}</span>
      <span class="nb"><span class="nh"><b>${t('訊息', 'Messages')}</b><span>${t('剛剛 · 模擬', 'now · simulated')}</span></span>
        <span class="nt">Zero Form ${t('驗證碼', 'code')}</span>
        <span class="nc"><b>${ui.otp.demoCode.slice(0, 3)} ${ui.otp.demoCode.slice(3)}</b><em>${t('點選填入', 'Tap to fill')}</em></span></span>
    </div>
    <div class="eyebrow">${ui.otp.purpose === 'sign' ? t('最後一步', 'Last step') : t('確認身份', 'Verify it’s you')}</div>
    <h2>${ui.otp.purpose === 'sign' ? t('輸入代碼，確認送出。', 'Enter the code to sign and submit.', '<br>') : t('輸入 6 位數驗證碼。', 'Enter the 6-digit code.', '<br>')}</h2>
    <p class="lead">${t('代碼已傳至', 'Sent to')} ${esc(ui.otp.to)}${ui.otp.purpose === 'sign' ? ` · ${t('綁定資料指紋', 'bound to fingerprint')} <span class="mono">${ui.otp.hash.slice(0, 12)}…</span>` : ''}</p>
    <form id="qf" class="code"><input id="qi" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="${t('驗證碼', 'Code')}" value="${esc(ui.draftVal ?? '')}">
      ${'<span class="cell"></span>'.repeat(6)}</form>
    <div class="err">${ui.err ? I.alert + esc(ui.err) : ''}</div>
    <div class="note left">${t('展示版：簡訊為模擬，代碼顯示在上方通知。', 'Demo: the text message is simulated — the code appears in the notification above.')}</div>
    <div class="spacer"></div>
    <button class="btn primary" data-go="verify" ${ui.busy ? 'disabled' : ''}>${ui.busy ? '<i class="spin"></i>' : ''}${ui.otp.purpose === 'sign' ? t('確認送出', 'Sign & submit') : t('繼續', 'Continue')} <span class="k">↵</span></button>`,

  known: () => {
    const d = S.app.draft;
    const keys = ['person.name', 'person.nationalId', 'person.phone', 'person.address', 'company.name', 'company.reservation_no', 'company.items', 'company.articles_date', ...ORDER.filter((k) => !ui.qs.includes(k))];
    return `
    <div class="eyebrow">${t('歡迎回來', 'Welcome back')}, ${esc(d['person.name'].value)}</div>
    <h2>${t('這些資料我們已經有了。', 'We already know these.', '<br>')}</h2>
    <p class="lead sm">${t('一人公司：申請人、負責人與唯一董事為同一人。', 'One person is the applicant, representative and sole director.')}</p>
    <div class="facts">${keys.filter((k) => d[k] && FIELDS[k]).map((k) => `
      <div class="fact"><div class="grow"><div class="k zh">${t(FIELDS[k].label, FIELDS[k].en)}</div><div class="v zh">${esc(fmt(k, d[k].value))}</div></div>${source(d[k])}</div>`).join('')}
    </div>
    <div class="legend"><span class="tag ok">${I.check}${t('政府紀錄', 'Government record')}</span>${t('展示用模擬資料', 'simulated for this demo')}</div>
    <div class="spacer"></div>
    <div class="cta-bar">
      <button class="btn primary" data-go="confirmKnown">${t('正確，繼續', 'Looks right — continue')} <span class="k">↵</span></button>
      <div class="note">${t(`沿用至全部 ${N_FORMS} 份表單，不必重填。`, `Reused across all ${N_FORMS} forms.`)}</div>
    </div>`;
  },

  q: () => {
    const k = ui.qs[ui.i], a = ASK[k], f = FIELDS[k], cur = S.app.draft[k];
    const val = ui.draftVal ?? (cur?.value ?? '');
    const used = FORMS.filter((x) => x.fields.includes(k));
    return `
    <div class="qnum">${ui.qs.length > 1 ? t(`第 ${ui.i + 1} / ${ui.qs.length} 題`, `Question ${ui.i + 1} of ${ui.qs.length}`) : t('修正一項', 'One fix')} ${cur?.source === 'Agent draft' ? `<span class="tag you">✦ ${t('請確認代理草稿', 'Check agent draft')}</span>` : ''}</div>
    <h2>${t(...a.q, '<br>')}</h2>
    <div class="qlabel zh">${t(f.label, f.en)}</div>
    <form class="field" id="qf">${a.pre ? `<span class="pre">${a.pre}</span>` : ''}<input id="qi" autocomplete="off" ${a.num ? 'inputmode="numeric"' : ''} placeholder="${a.ph}" value="${esc(a.num && val ? money(String(val).replace(/\D/g, '') || 0) : val)}"></form>
    <div class="err">${ui.err ? I.alert + esc(ui.err) : a.hint ? `<span class="hint">${t(...a.hint)}</span>` : ''}</div>
    <div class="used"><span class="lbl">${t(`帶入 ${used.length} / ${N_FORMS} 份表單`, `Fills ${used.length} of ${N_FORMS} forms`)}</span>${used.map((x) => `<span class="zh">${t(x.name.length > 8 ? x.name.slice(0, 7) + '…' : x.name, x.en)}</span>`).join('')}</div>
    <div class="spacer"></div>
    <div class="cta-bar">
      <div class="row"><button class="btn ghost" data-go="back">← ${t('返回', 'Back')}</button><div class="spacer"></div>
      <button class="btn primary auto" data-go="answer" ${ui.busy ? 'disabled' : ''}>${t('確認', 'OK')} <span class="k">↵</span></button></div>
    </div>`;
  },

  review: () => {
    const d = S.app.draft, ready = !ui.busy && S.app.selfReview?.current && S.app.selfReview?.recommendation === 'ready_to_submit';
    const group = (title, keys) => `<div class="group"><h3>${title}</h3><div class="facts">${keys.map((k) => `
      <div class="fact"><div class="grow"><div class="k zh">${t(FIELDS[k].label, FIELDS[k].en)}</div><div class="v zh">${esc(fmt(k, d[k]?.value))}</div></div>
      ${ORDER.includes(k) ? `<button class="edit" data-edit="${k}">${t('修改', 'Edit')}</button>` : ''}${source(d[k])}</div>`).join('')}</div></div>`;
    const line = ['company.name', 'company.capital', 'company.address', 'owner.name'].filter((k) => d[k]?.value).map((k) => esc(fmt(k, d[k].value))).join(' · ');
    return `
    <h2>${t('送出前，先核對。', 'Review before you submit.', '<br>')}</h2>
    ${evidenceTiles()}
    <details class="factsum" ${ui.factsOpen ? 'open' : ''}><summary><span class="line zh">${line}</span><span class="edit">${t('查看／修改', 'View & edit')}</span></summary>
      ${group(t('公司', 'Company'), ['company.name', 'company.reservation_no', 'company.address', 'company.capital', 'company.items', 'company.articles_date'].filter((k) => FIELDS[k]))}
      ${group(t('相關人員', 'People'), ['person.name', 'person.nationalId', 'owner.name'])}
    </details>
    ${selfReviewCard()}
    <div class="spacer"></div>
    <div class="cta-bar sticky">
      <div class="err">${ui.err ? I.alert + esc(ui.err) : ''}</div>
      <button class="btn primary" data-go="sign" ${ready ? '' : 'disabled'}>${t('確認送出', 'Sign & submit')} <span class="k">↵</span></button>
      <div class="note">${ready ? t(`以代碼確認，產生 ${N_GEN} 份 PDF。不會送交政府。`, `Confirm with a code to generate ${N_GEN} PDFs. Nothing is filed with the government.`) : t('上傳文件並通過自我核對後即可送出。', 'Upload the documents and pass self-review to continue.')}</div>
    </div>`;
  },

  signing: () => {
    const p = ui.sign || { phase: 1, pdf: 0 };
    const step = (n, zh, en, sub) => `<li class="${p.phase > n ? 'done' : p.phase === n ? 'active' : ''}"><span class="dot">${p.phase > n ? I.check : n}</span><div><b>${t(zh, en)}</b>${sub ? `<div class="sub">${sub}</div>` : ''}</div></li>`;
    return `
    <div class="eyebrow">${t('已確認', 'Confirmed')} · ${t('請稍候', 'one moment')}</div>
    <h2>${p.phase > 3 ? t('完成。', 'Done.') : t('正在產生文件…', 'Generating your documents…', '<br>')}</h2>
    <ol class="stepper">
      ${step(1, '封存快照', 'Sealing snapshot', `<span class="mono">sha256:${esc((ui.otp?.hash || '').slice(0, 16))}…</span>`)}
      ${step(2, `產生 ${N_GEN} 份 PDF`, `Generating ${N_GEN} PDFs`, p.phase >= 2 ? `<div class="pdfs">${DOCS.map((f, i) => `<span class="${i < p.pdf ? 'on' : ''}" title="${esc(t(f.name, f.en))}">${i + 1}</span>`).join('')}</div>` : '')}
      ${step(3, '送交審查', 'Sent to officer', p.phase >= 3 ? t('審查人員即可看到你的案件。', 'The officer can now see your application.') : '')}
    </ol>`;
  },

  fixintro: () => {
    const dec = S.app.decision, f = FIELDS[dec.field];
    return `
    <div class="badge warn">${I.alert}</div>
    <h2>${t('有一項需要修正。', 'One thing to fix.', '<br>')}</h2>
    <div class="callout warn"><b>${t('審查意見', 'Officer note')} · <span class="zh">${t(f.label, f.en)}</span></b><span>${esc(dec.note || t('請確認此欄位。', 'Please check this field.'))}</span></div>
    <p class="lead">${t('只重新開放此欄位，其餘資料維持已確認版本。', 'Only this field is reopened; everything else stays as signed.', '<br>')}</p>
    <div class="spacer"></div>
    <button class="btn primary" data-go="fix">${t(`修正 ${f.label}`, `Fix ${f.en.replace(/\s*\(.*\)/, '').toLowerCase()}`)} <span class="k">↵</span></button>`;
  },

  done: () => {
    const a = S.app, sn = a.snapshot;
    const head = {
      submitted: ['wait', I.send, t('已送出，等待審查', 'Submitted — waiting for the officer'), `<span class="status blue"><i></i>${t('展示審查中', 'Demo review in progress')}</span>`],
      approved: ['ok', I.check, t('展示審查通過', 'Approved (demo)'), `<span class="status green">${I.check}${t('展示流程完成，尚未送交政府', 'Demo complete — nothing was filed with the government')}</span>`],
      rejected: ['bad', '×', t('未核准', 'Not approved'), `<span class="lead">${esc(a.decision?.note || '')}</span>`],
      revision: ['wait', I.send, t('已重新送出', 'Re-submitted'), `<span class="status blue"><i></i>${t('等待審查', 'Waiting for review')}</span>`],
    }[a.status];
    return `
    <div class="badge ${head[0]}">${head[1]}</div>
    <div><h1>${head[2]}</h1><div style="margin-top:12px">${head[3]}</div></div>
    <div class="group"><h3>${t(`已產生 ${N_GEN} 份 PDF`, `${N_GEN} PDFs generated`)} · ${t(`另 ${N_FILE} 份已存檔`, `${N_FILE} already on file`)}</h3><div class="docs">${DOCS.map((f) => `
      <a href="/doc/${sn.v}/${f.id}" target="_blank" rel="noopener"><span class="ic">${I.doc}</span><span class="nm"><span class="n zh">${t(f.name, f.en)}</span></span><span class="open">PDF ↗</span></a>`).join('')}</div></div>
    <div class="hash"><div class="l">${t('已確認版本', 'Signed snapshot')} · v${sn.v} · ${esc(a.id)}</div><div class="h mono">sha256:${sn.hash}</div>
      <div class="s">${sn.prev ? `${t('取代', 'Replaces')} v${sn.v - 1} · ` : ''}${t('代碼確認', 'Code confirmed')} ${esc(sn.to)} · ${new Date(sn.signedAt).toLocaleString()}</div></div>
    <div class="err" role="alert">${esc(ui.err)}</div>
    <div class="note left">${t('下次申請可沿用已儲存的公司資料。', 'Next time, your saved company details are reused — 0 questions.')}</div>`;
  },
};

// ---------- actions ----------
const ACTIONS = {
  async login() { ui.otp = { purpose: 'login', ...(await api('/api/login/send', {})) }; ui.step = 'otp'; ui.err = ''; ui.draftVal = ''; render(); },
  async fillCode() {
    if (ui.busy || !$('qi')) return;
    ui.busy = true;
    const inp = $('qi'), code = ui.otp.demoCode;
    document.querySelector('.notif')?.classList.add('used');
    for (let i = 1; i <= code.length; i++) { inp.value = code.slice(0, i); paintCode(); await sleep(70); }
    await sleep(160); ui.busy = false; ACTIONS.verify();
  },
  async verify() {
    const code = ($('qi')?.value || '').trim();
    if (ui.otp.purpose === 'sign') return ACTIONS.signVerify(code);
    ui.busy = true; ui.err = ''; render();
    try {
      S = await api('/api/login/verify', { code });
      ui.qs = ORDER.filter((k) => S.app.missing.includes(k));
      ui.step = S.app.status === 'draft' ? 'known' : 'done';
      ui.draftVal = null;
    } catch (e) { ui.err = e.message; ui.draftVal = ''; }
    ui.busy = false; render();
  },
  async signVerify(code) {
    ui.busy = true; ui.err = ''; ui.step = 'signing'; ui.sign = { phase: 1, pdf: 0 }; render();
    const t1 = setTimeout(() => { ui.sign.phase = 2; render(); }, 900);
    const iv = setInterval(() => { if (ui.sign.phase === 2 && ui.sign.pdf < N_GEN - 1) { ui.sign.pdf++; render(); } }, 1050);
    try {
      const next = await api('/api/sign/verify', { code });
      clearTimeout(t1); clearInterval(iv);
      ui.sign = { phase: 2, pdf: N_GEN }; render(); await sleep(450);
      ui.sign.phase = 3; render(); await sleep(700);
      ui.sign.phase = 4; S = next; ui.step = 'done'; ui.draftVal = null;
    } catch (e) { clearTimeout(t1); clearInterval(iv); ui.err = e.message; ui.draftVal = ''; ui.step = 'otp'; }
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
  loadDemoEvidence() {
    if (!DEMO_SAMPLES || !['draft', 'revision'].includes(S.app.status)) return;
    return withUpload(missingKinds(), async (kind) => {
      const r = await fetch(`/api/mock-attachments/${kind}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t('無法取得示範文件。', 'Demo sample unavailable.'));
      return r.blob();
    });
  },
  async selfReview() {
    ui.busy = true; ui.activity = 'self-review'; ui.err = ''; render();
    try { await api('/api/self-review', {}); S = await api('/api/state'); }
    catch (error) { ui.err = error.message; }
    finally { ui.busy = false; ui.activity = null; render(); }
    if (S.app.selfReview) document.querySelector('.self-review')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },
  async sign() {
    if (!S.app.selfReview?.current || S.app.selfReview.recommendation !== 'ready_to_submit') return;
    try { ui.otp = { purpose: 'sign', ...(await api('/api/sign/send', {})) }; ui.step = 'otp'; ui.err = ''; ui.draftVal = ''; }
    catch (e) { ui.err = e.message; }
    render();
  },
};

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]')?.dataset.go;
  const ed = e.target.closest('[data-edit]')?.dataset.edit;
  if (go && !ui.busy) { if (e.target.closest('summary')) e.preventDefault(); ACTIONS[go](); }
  if (ed && !ui.busy) ACTIONS.edit(ed);
});
document.addEventListener('toggle', (e) => { if (e.target.classList?.contains('factsum')) ui.factsOpen = e.target.open; }, true);
document.addEventListener('submit', (e) => { e.preventDefault(); ui.step === 'otp' ? ACTIONS.verify() : ACTIONS.answer(); });
document.addEventListener('change', (event) => {
  const kind = event.target.dataset.upload;
  if (!kind || ui.busy || !event.target.files?.length) return;
  const file = event.target.files[0];
  withUpload([kind], async () => file);
});
// Drag a PDF onto an evidence tile.
document.addEventListener('dragover', (e) => { const tile = e.target.closest?.('[data-drop]'); if (!tile) return; e.preventDefault(); tile.classList.add('drag'); });
document.addEventListener('dragleave', (e) => e.target.closest?.('[data-drop]')?.classList.remove('drag'));
document.addEventListener('drop', (e) => {
  const tile = e.target.closest?.('[data-drop]'); if (!tile) return;
  e.preventDefault(); tile.classList.remove('drag');
  const file = e.dataTransfer?.files?.[0]; if (file && !ui.busy) withUpload([tile.dataset.drop], async () => file);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.closest?.('.notif')) { e.preventDefault(); return ACTIONS.fillCode(); }
  if (e.key !== 'Enter' || e.target.tagName === 'INPUT' || e.target.closest('button, a, summary') || ui.busy) return;
  e.preventDefault(); // stop the same keystroke from submitting the next screen's input
  const btn = document.querySelector('[data-go="sign"]:not([disabled])') || document.querySelector('.btn.primary:not([disabled])'); if (btn) btn.click();
});

// Live updates from the officer (approve / request change)
setInterval(async () => {
  if (!S?.app || !['submitted', 'revision'].includes(S.app.status) || ['q', 'review', 'otp', 'signing'].includes(ui.step)) return;
  const next = await api('/api/state');
  if (next.app?.status !== S.app.status || next.app?.snapshot?.v !== S.app.snapshot?.v) { S = next; render(); }
}, 2000);

S = await api('/api/state');
try { ui.readiness = await api('/api/self-review/readiness'); } catch { ui.readiness = null; }
mountLanguageSwitch(() => {
  const input = $('qi');
  if (input) ui.draftVal = input.value;
  render();
});
render();
