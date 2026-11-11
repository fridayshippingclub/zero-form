// Officer console — vanilla JS, polls /api/officer every 2s.
// ?mock=1 | ?mock=tamper | ?mock=revision | ?mock=approved | ?mock=v2 renders a sample payload (no server needed).
import { FORMS, money, rocDate } from '/schema.js';
import { sourceLabel, verificationLabel, verificationDetail, evidenceKind, evidenceField, evidenceStatus } from '/labels.js';
import { t, mountLanguageSwitch } from '/language.js';

const $root = document.getElementById('root');
const $live = document.getElementById('live');
const MOCK = new URLSearchParams(location.search).get('mock');
const ORDER = ['company.name', 'company.reservation_no', 'company.items', 'company.address', 'company.capital', 'company.articles_date', 'person.name', 'person.nationalId', 'person.phone', 'person.address', 'owner.name', 'app.date'];
const STATUS = { submitted: ['已送出', 'Submitted'], revision: ['待修正', 'Change requested'], approved: ['已核准', 'Approved'], rejected: ['已駁回', 'Rejected'], draft: ['草稿', 'Draft'] };
const TOTAL_FORMS = FORMS.length;

const st = { payload: null, key: '', sel: null, note: '', busy: false, prevData: null, prevV: null, lastV: null };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (h) => (h ? `${h.slice(0, 8)}…${h.slice(-4)}` : '');
const when = (iso) => { try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };
const fmt = (k, v, f) => {
  if (v == null || v === '') return '<span class="muted">—</span>';
  if (k === 'company.capital') return `NT$ ${esc(money(v))}`;
  if (f?.type === 'date') return `<span title="${esc(v)}">${esc(rocDate(v))}</span>`;
  if (f?.suffix) return esc(v + f.suffix);
  return esc(v);
};
const ICON = {
  ok: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bad: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4.5 4.5l7 7m0-7l-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  doc: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 5h8M4 8h8M4 11h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  shield: '<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const fieldName = (fields, k) => (fields[k] ? t(fields[k].label, fields[k].en) : k);
const checkValue = (value, fallback = '—') => {
  if (value?.on_or_before) return esc(`${t('不晚於', 'On or before')} ${value.on_or_before}`);
  const label = { provided: t('已提供', 'Provided'), approved: t('已核准', 'Approved'), rejected: t('已駁回', 'Rejected'), 'valid issue date': t('有效日期', 'Valid date') }[value];
  return esc(value == null ? fallback : label ?? (typeof value === 'object' ? JSON.stringify(value) : value));
};

// ---------- data ----------
async function api(path, opts) {
  if (MOCK) return mockApi(path, opts);
  const r = await fetch(path, opts && { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(opts.body ?? {}) });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

async function poll() {
  try {
    const p = await api('/api/officer');
    $live.classList.remove('off');
    // Revision diff: load previous snapshot once per version so the officer sees what changed.
    if (p.app && p.app.v > 1 && st.prevV !== p.app.v - 1) {
      try { const prev = await api(`/api/package/${p.app.v - 1}`); st.prevData = prev.data; st.prevV = p.app.v - 1; } catch { st.prevData = null; }
    }
    if (!p.app || p.app.v === 1) { st.prevData = null; st.prevV = null; }
    if (p.app && st.lastV !== `${p.app.id}:${p.app.v}`) { st.lastV = `${p.app.id}:${p.app.v}`; st.sel = null; st.note = ''; }
    const key = JSON.stringify(p) + st.prevV;
    if (key !== st.key) { st.key = key; st.payload = p; render(); }
  } catch { $live.classList.add('off'); }
}

// ---------- render ----------
function render() {
  const p = st.payload;
  if (!p?.app) {
    $root.innerHTML = `<div class="empty"><div class="ring"></div><h1>${t('等待申請送出…', 'Waiting for a submission…', '<br>')}</h1>
      <p>${t('申請人以簡訊代碼確認後，案件與即時核對結果會顯示於此。', 'Applications appear here after text-code confirmation, with live checks.', '<br>')}</p></div>`;
    return;
  }
  const { app, verify, fields } = p;
  const failed = verify.checks.filter((c) => !c.ok);
  const externalReview = verify.externalReview;
  const evidenceReady = !externalReview || externalReview.recommendation === 'approve';
  const company = app.data['company.name'] ? `${app.data['company.name']}${fields['company.name']?.suffix ?? '有限公司'}` : '未命名公司 · Untitled company';
  const changed = st.prevData ? Object.keys(app.data).filter((k) => st.prevData[k] !== app.data[k]) : [];
  const keys = [...ORDER.filter((k) => k in app.data), ...Object.keys(app.data).filter((k) => !ORDER.includes(k))];

  const focused = document.activeElement?.id === 'note';
  const caret = focused ? document.activeElement.selectionStart : 0;

  $root.innerHTML = `
  <div class="head">
    <div>
      <div class="ref"><span class="mono">${esc(app.id)}</span><span class="pill ${esc(app.status)}">${esc(STATUS[app.status] ? t(...STATUS[app.status]) : app.status)}</span></div>
      <h1>${esc(company)}</h1>
      <div class="story">${TOTAL_FORMS > verify.docs.length ? t(`${TOTAL_FORMS} 份必備表單：${verify.docs.length} 份由確認資料產生，${TOTAL_FORMS - verify.docs.length} 份已存檔`, `${TOTAL_FORMS} required forms: ${verify.docs.length} generated from the signed facts, ${TOTAL_FORMS - verify.docs.length} already on file`) : t(`${TOTAL_FORMS} 份必備表單，全部由同一份確認資料產生`, `All ${TOTAL_FORMS} required forms generated from one signed snapshot`)}</div>
    </div>
    <div class="snap">
      ${t('確認版本', 'Snapshot')} <b>v${app.v}</b> · <span class="mono" title="${esc(app.hash)}">sha256:${esc(short(app.hash))}</span><br>
      ${app.prev ? `${t('前版', 'previous')}: <span class="mono" title="${esc(app.prev)}">${esc(short(app.prev))}</span> · ` : ''}${t('確認時間', 'signed')} ${esc(when(app.signedAt))}
    </div>
  </div>

  <div class="grid">
    <div>
      ${failed.length ? `<div class="banner bad">${ICON.bad}<div><b>${failed.length}/${verify.checks.length} 項未通過 · Checks failed</b><span>${esc(failed.map((c) => c.label).join(' and '))} — 內容與確認版本不符，請勿核准。 Package differs from the signed version; do not approve.</span></div></div>`
        : changed.length && app.status === 'submitted' ? `<div class="banner good">${ICON.ok}<div><b>已修正並再次確認 / Re-signed — v${app.v} replaces v${app.v - 1}</b><span>已修改 ${changed.length} 欄 / Fields changed: ${esc(changed.map((k) => fields[k]?.en ?? k).join(', '))}. 其餘不變 / Everything else is identical.</span></div></div>` : ''}

      <section>
        <h3 class="section-title">${t('核對結果', 'Verification')} <span class="muted">${t('依確認版本即時核對', 'Live checks')}</span></h3>
        <div class="checks">
          ${verify.checks.map((c) => `<div class="card check ${c.ok ? '' : 'bad'}" data-check="${esc(c.key)}">
            <div class="ic">${c.ok ? ICON.ok : ICON.bad}</div><div class="lbl">${esc(verificationLabel(c))}</div><div class="det">${esc(verificationDetail(c))}</div></div>`).join('')}
        </div>
        ${evidenceSummary(externalReview)}
      </section>

      <section>
        <h3 class="section-title">${t('資料事實', 'Facts')} <span class="muted">${t(`${keys.length} 項 → ${TOTAL_FORMS} 份表單`, `${keys.length} facts → ${TOTAL_FORMS} forms`)}<br>${t('點選欄位要求修正', 'Select a row to request a change')}</span></h3>
        <div class="card">
          <table class="facts data-facts">
            <thead><tr><th style="width:20%">${t('欄位', 'Field')}</th><th style="width:25%">${t('內容', 'Value')}</th><th>${t('來源', 'Source')}</th><th style="width:96px">${t('沿用', 'Used in')}</th><th class="act"></th></tr></thead>
            <tbody>
              ${keys.map((k) => {
                const f = fields[k] ?? { label: k, en: '' };
                const pv = app.provenance?.[k] ?? {};
                const n = app.usedIn?.[k] ?? 0;
                const req = app.status === 'revision' && app.decision?.field === k;
                const isChanged = changed.includes(k);
                return `<tr data-k="${esc(k)}" class="${st.sel === k ? 'sel' : ''} ${req ? 'req' : ''}">
                  <td><div class="fz">${t(esc(f.label), esc(f.en), '<br>')}</div></td>
                  <td class="val">${fmt(k, app.data[k], f)} ${isChanged ? `<span class="badge warn">${t('已修改', 'Changed')}</span>` : ''}</td>
                  <td><div class="src">${esc(sourceLabel(pv.source))} ${pv.verified ? `<span class="badge ok">${ICON.shield} ${t('已核對', 'Verified')}</span>` : `<span class="badge self">${t('自行填寫', 'Self-declared')}</span>`}</div></td>
                  <td class="used"><span class="bar"><i style="width:${Math.round((n / TOTAL_FORMS) * 100)}%"></i></span>${n}/${TOTAL_FORMS} ${t('份', 'forms')}</td>
                  <td class="act">${app.status === 'submitted' ? `<button class="req-btn" type="button" aria-label="${t('要求修正此欄', 'Request a change to this field')}">${st.sel === k ? t('已選取', 'Selected') : t('要求修正', 'Request fix')}</button>` : ''}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 class="section-title">${t('產出文件', 'Generated documents')} <span class="muted">${t('版本', 'Snapshot')} v${app.v} · ${verify.docs.filter((d) => d.ok).length}/${verify.docs.length} ${t('相符', 'match')}</span></h3>
        <div class="docs">
          ${verify.docs.map((d) => {
            const en = FORMS.find((f) => f.id === d.id)?.en ?? d.id;
            return `<a class="card doc ${d.ok ? '' : 'bad'}" href="/doc/${app.v}/${encodeURIComponent(d.id)}" target="_blank" rel="noopener">
              <span class="fi">${ICON.doc}</span><span><div class="nm">${t(esc(d.name), esc(en), '<br>')}</div></span>
              <span class="st">${d.ok ? `<span class="badge ok">${ICON.shield} ${t('相符', 'Match')}</span>` : `<span class="badge" style="background:var(--danger-soft);color:var(--danger)">${t('不符', 'Mismatch')}</span>`}</span></a>`;
          }).join('')}
        </div>
      </section>
      ${externalReview ? `<section>
        <h3 class="section-title">${t('佐證附件', 'Supporting evidence')} <span class="muted">${t('與確認資料比對', 'Compared with signed facts')}</span></h3>
        <div class="card evidence-table" tabindex="0" aria-label="${t('佐證核對表，可橫向捲動', 'Evidence checks, scroll horizontally')}"><table class="facts evidence-facts"><thead><tr><th>${t('項目', 'Check')}</th><th>${t('預期', 'Expected')}</th><th>${t('文件內容', 'In document')}</th><th>${t('結果／來源', 'Result / source')}</th></tr></thead><tbody>
          ${externalReview.checks.slice().sort((a, b) => Number(a.status === 'passed') - Number(b.status === 'passed')).map((check) => `<tr><td><div class="fe">${esc(evidenceKind(check.kind))}</div><div>${esc(evidenceField(check.field))}</div></td>
            <td class="val">${checkValue(check.expected)}</td><td class="val">${checkValue(check.actual, t('未提供', 'Not available'))}</td>
            <td><span class="badge ${check.status === 'passed' ? 'ok' : 'warn'}">${esc(evidenceStatus(check.status))}</span>${check.source ? `<div style="margin-top:6px"><a href="${esc(check.source.url)}" target="_blank" rel="noopener">${t(`來源 · 第 ${esc(check.source.page)} 頁`, `Source · page ${esc(check.source.page)}`, '<br>')}</a></div>` : ''}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="muted" style="font-size:12px">${t('展示規則：查核簽證日＝章程訂立日，且章程日不晚於申請日。', 'Demo rule: certification matches the articles date, which is on or before the application date.', '<br>')}</p>
      </section>` : ''}
    </div>

    <aside class="side">
      <div class="card decision">${decisionPanel(app, fields, failed, evidenceReady)}</div>
      <div class="demo"><span class="dl">${t('展示控制', 'Demo controls')}</span><button id="tamper" class="${failed.some((c) => c.key === 'integrity') ? 'on' : ''}">${failed.some((c) => c.key === 'integrity') ? t('已模擬竄改', 'Tampering simulated') : t('模擬竄改', 'Simulate tampering')}</button><button id="reset">${t('重設展示', 'Reset demo')}</button></div>
    </aside>
  </div>`;

  if (focused) { const t = document.getElementById('note'); if (t) { t.focus(); t.setSelectionRange(caret, caret); } }
}

function evidenceSummary(review) {
  if (!review?.checks?.length) return '';
  const kinds = [...new Set(review.checks.map((c) => c.kind))];
  const passed = review.checks.filter((c) => c.status === 'passed').length;
  const ok = passed === review.checks.length;
  return `<div class="card evsum"><b>${t('佐證文件', 'Evidence')}</b>
    ${kinds.map((kind) => { const url = review.checks.find((c) => c.kind === kind && c.source?.url)?.source.url;
      return url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${ICON.doc}${esc(evidenceKind(kind))} ↗</a>` : `<span class="muted">${ICON.doc}${esc(evidenceKind(kind))}</span>`; }).join('')}
    <span class="res ${ok ? 'ok' : 'warn'}">${ok ? ICON.ok : ICON.bad}${t(`${passed}/${review.checks.length} 項相符`, `${passed}/${review.checks.length} match`)}</span></div>`;
}

function decisionPanel(app, fields, failed, evidenceReady = true) {
  const d = app.decision;
  const pkg = `<div class="pkg"><span>${t('確認資料', 'Signed package')}</span><a href="/api/package/${app.v}" target="_blank" rel="noopener">${t('查看 JSON', 'View JSON')} ↗</a></div>`;
  if (app.status === 'revision') {
    return `<h2>${t('審查決定', 'Decision')}</h2><p class="sub">${t('已請申請人修正一項資料。', 'One field change requested.', '<br>')}</p>
      <div class="outcome revision"><div class="t">${t('待修正', 'Change requested')}</div><div class="d">${esc(fieldName(fields, d?.field))}</div>
      ${d?.note ? `<div class="note">“${esc(d.note)}”</div>` : ''}</div>
      <div class="waiting"><span class="ring"></span>${t('等待申請人再次確認，僅開放指定欄位。', 'Waiting for re-signing; only this field is reopened.', '<br>')}</div>${pkg}`;
  }
  if (app.status === 'approved' || app.status === 'rejected') {
    const ok = app.status === 'approved';
    return `<h2>${t('審查決定', 'Decision')}</h2><p class="sub">${t('已通知申請人。', 'Applicant notified.')}</p>
      <div class="outcome ${app.status}"><div class="t">${ok ? t('已核准', 'Approved') : t('已駁回', 'Rejected')}</div>
      <div class="d">確認版本 / Snapshot v${app.v} · ${esc(when(d?.at))}</div>${d?.note ? `<div class="note">“${esc(d.note)}”</div>` : ''}</div>${pkg}`;
  }
  const sel = st.sel && fields[st.sel] ? st.sel : null;
  const selLabel = sel ? fieldName(fields, sel) : null;
  return `<h2>${t('審查決定', 'Decision')}</h2><p class="sub">${failed.length ? t('核對未通過，請要求修正或駁回。', 'Checks failed. Request a change or reject.', '<br>') : !evidenceReady ? t('佐證仍需核對，請檢視下方結果。', 'Supporting evidence needs review. Check the results.', '<br>') : t('核對均通過，請檢視資料後決定。', 'All checks passed. Review and decide.', '<br>')}</p>
    <div class="field-pick ${sel ? 'on' : ''}">
      ${sel ? `<div class="row"><div><div class="k">${t('待修正欄位', 'Field to change')}</div><div>${esc(selLabel)}</div></div><button class="x" id="clear" title="${t('清除', 'Clear')}">×</button></div>`
        : t('點選表格欄位以要求修正。', 'Select a field to request a change.', '<br>')}
    </div>
    <textarea id="note" placeholder="${sel ? t('請說明修正內容', `What should change in “${esc(selLabel)}”?`) : t('給申請人的說明（選填）', 'Note to applicant (optional)')}">${esc(st.note)}</textarea>
    <div class="btns">
      <button class="btn primary" id="approve" ${failed.length || !evidenceReady || st.busy ? 'disabled' : ''}>${t('核准', 'Approve')}</button>
      <button class="btn" id="revise" ${!sel || st.busy ? 'disabled' : ''}>${sel ? t(`要求修正 ${esc(fields[sel].label)}`, `Change ${esc(fields[sel].en)}`) : t('要求修正', 'Request change')}</button>
      <button class="btn danger" id="reject" ${st.busy ? 'disabled' : ''}>${t('駁回', 'Reject')}</button>
    </div>
    ${failed.length ? `<div class="hint bad">${t(`暫不能核准：${failed.length} 項未通過。`, `Approval blocked: ${failed.length} failed checks.`, '<br>')}</div>` : !evidenceReady ? `<div class="hint bad">${t('佐證核對全部通過後才能核准。', 'Approval waits for all evidence checks.', '<br>')}</div>` : ''}${pkg}`;
}

// ---------- interactions ----------
$root.addEventListener('click', async (e) => {
  const row = e.target.closest('tbody tr[data-k]');
  if (row && st.payload?.app && !['approved', 'rejected', 'revision'].includes(st.payload.app.status)) {
    st.sel = st.sel === row.dataset.k ? null : row.dataset.k; render();
    if (st.sel) document.getElementById('note')?.focus();
    return;
  }
  const id = e.target.closest('button')?.id;
  if (!id) return;
  if (id === 'clear') { st.sel = null; render(); return; }
  if (id === 'approve') return decide({ decision: 'approve', note: st.note || undefined });
  if (id === 'revise' && st.sel) return decide({ decision: 'revise', field: st.sel, note: st.note || undefined });
  if (id === 'reject') { if (confirm('確定駁回？申請人須重新申請。 Reject this application and require a new application?')) decide({ decision: 'reject', note: st.note || undefined }); return; }
  if (id === 'tamper') { await api('/api/demo/tamper', { body: {} }); return poll(); }
  if (id === 'reset') { if (confirm('重設展示並清除案件？ Reset the demo and clear the application?')) { await api('/api/demo/reset', { body: {} }); st.sel = null; st.note = ''; return poll(); } }
});
$root.addEventListener('input', (e) => { if (e.target.id === 'note') st.note = e.target.value; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.sel) { st.sel = null; render(); } });

async function decide(body) {
  st.busy = true; render();
  try { await api('/api/officer/decide', { body }); st.sel = null; st.note = ''; }
  catch (err) { alert(`無法儲存決定 / Could not record decision: ${err.message}`); }
  finally { st.busy = false; st.key = ''; await poll(); }
}

// ---------- mock mode ----------
let mock;
function mockInit() {
  const usedIn = (k) => FORMS.filter((f) => f.fields.includes(k)).length;
  const data = {
    'company.name': '大大科技', 'company.items': 'F119010 電子材料批發業、F113050 事務性機器設備批發業', 'company.address': '臺北市信義區松仁路 100 號 12 樓',
    'company.capital': '1000000', 'person.name': '陳大文', 'person.nationalId': 'A123456789', 'person.phone': '0912-345-678', 'person.address': '臺北市大安區仁愛路四段 1 號',
    'owner.name': '王建國', 'company.articles_date': '2026-11-11', 'app.date': '2026-11-11',
  };
  const src = (s, v = true) => ({ source: s, verified: v });
  const provenance = {
    'company.name': src('Name reservation 預查 #113045678'), 'company.items': src('Name reservation 預查 #113045678'), 'company.address': src('Applicant', false),
    'company.capital': src('Applicant', false), 'person.name': src('MOI identity'), 'person.nationalId': src('MOI identity'),
    'person.phone': src('Verified by SMS'), 'person.address': src('Household registration'),
    'owner.name': src('Applicant', false), 'company.articles_date': src('Demo scenario'), 'app.date': src('System'),
  };
  const FIELDS_MOCK = {}; // filled lazily from schema module
  const v1 = 'a3f19c04e2b7d8155c0e6f9a1b2c3d4e5f60718293a4b5c6d7e8f9012ab4c9e1';
  mock = {
    fields: FIELDS_MOCK, tampered: MOCK === 'tamper',
    app: { id: 'TPE-2026-418230', status: 'submitted', decision: null, v: 1, hash: v1, prev: null, signedAt: new Date().toISOString(),
      data, provenance, usedIn: Object.fromEntries(Object.keys(data).map((k) => [k, usedIn(k)])) },
    v1data: { ...data },
  };
  if (MOCK === 'revision') { mock.app.status = 'revision'; mock.app.decision = { decision: 'revise', field: 'company.address', note: '請補上樓層與室號 — please add the floor and unit number.', at: new Date().toISOString() }; }
  if (MOCK === 'approved') { mock.app.status = 'approved'; mock.app.decision = { decision: 'approve', at: new Date().toISOString() }; }
  if (MOCK === 'v2') {
    mock.v1data['company.address'] = '臺北市信義區松仁路 100 號';
    Object.assign(mock.app, { v: 2, prev: v1, hash: '7be2d0c4a1f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5c2d3' });
  }
  if (MOCK === 'empty') mock.app = null;
  return import('/schema.js').then((m) => Object.assign(FIELDS_MOCK, m.FIELDS));
}
async function mockApi(path, opts) {
  if (!mock) await mockInit();
  if (path === '/api/officer') {
    if (!mock.app) return { app: null };
    const t = mock.tampered;
    const docs = FORMS.filter((f) => !f.onFile).map((f) => ({ id: f.id, name: f.name, ok: !(t && f.fields.includes('company.capital')) }));
    const app = structuredClone(mock.app);
    if (t) app.data['company.capital'] = String(Number(app.data['company.capital']) * 10);
    return { app, fields: mock.fields, verify: { docs, checks: [
      { key: 'identity', label: 'Identity', ok: true, detail: 'SMS code confirmed this exact snapshot' },
      { key: 'integrity', label: 'Integrity', ok: !t, detail: t ? 'Contents changed after signing' : 'Hash + server signature match' },
      { key: 'consistency', label: 'Consistency', ok: docs.every((d) => d.ok), detail: `${docs.filter((d) => d.ok).length} of ${docs.length} documents match` },
      { key: 'evidence', label: 'Evidence', ok: true, detail: 'Name reservation #113045678 valid' },
      { key: 'records', label: 'Gov records', ok: true, detail: 'Household registration match' },
    ] } };
  }
  if (path.startsWith('/api/package/')) return { data: mock.v1data };
  if (path === '/api/officer/decide') {
    const { decision, field, note } = opts.body;
    mock.app.decision = { decision, field, note, at: new Date().toISOString() };
    mock.app.status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'revision';
    return { ok: true };
  }
  if (path === '/api/demo/tamper') { mock.tampered = true; return { ok: true }; }
  if (path === '/api/demo/reset') { mock.app = null; return { ok: true }; }
  return {};
}

mountLanguageSwitch(render);
poll();
setInterval(poll, 2000);
