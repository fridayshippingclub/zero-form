// Agency setup: read the government's forms ONCE, merge overlapping boxes into shared facts,
// a human approves, then publish to the website button.
// Demo: the "AI reading" is mocked — the mapping below was taken from the official PDFs' text.

const PAGE = 'https://tcooc-co.gov.taipei/cp.aspx?n=1ddc8c221b97a1bd&s=5BA095ECA5D6FAB3';
const G = 'https://gcis.nat.gov.tw/mainNew/matterAction.do?method=showFile&fileNo=';

const FORMS = [
  { id: 'c00001', name: '公司名稱及所營事業登記預查申請表', en: 'Name reservation', url: 'https://gcis.nat.gov.tw/F/c00001' },
  { id: 'app', name: '公司設立登記申請書', en: 'Application letter', url: 'https://www-ws.gov.taipei/001/Upload/676/relfile/43122/105581/6420cf31-ad92-4f72-baa5-f34a70a127b9.pdf' },
  { id: 't70126', name: '章程', en: 'Articles of incorporation', url: 'https://gcis.nat.gov.tw/F/t70126_p' },
  { id: 't70130', name: '股東同意書', en: 'Shareholder consent', url: G + 't70130_p' },
  { id: 't70132', name: '董事願任同意書', en: 'Director consent', url: G + 't70132_p' },
  { id: 't70124', name: '建物所有權人同意書', en: 'Building owner consent', url: G + 't70124_p' },
  { id: 't70135', name: '設立登記表', en: 'Registration form', url: G + 't70135_p' },
];

// Shared facts. `known` = where Zero Form already gets it; otherwise the applicant is asked once.
const FACTS = [
  { key: 'company.name', zh: '公司名稱', en: 'Company name', known: 'Name reservation' },
  { key: 'company.items', zh: '所營事業', en: 'Business items', known: 'Name reservation' },
  { key: 'reservation.id', zh: '預查編號', en: 'Reservation number', known: 'Name reservation' },
  { key: 'person.name', zh: '負責人姓名', en: 'Representative', known: 'MOI identity' },
  { key: 'person.nationalId', zh: '身分證字號', en: 'National ID', known: 'MOI identity' },
  { key: 'person.phone', zh: '聯絡電話', en: 'Phone', known: 'Verified by SMS' },
  { key: 'person.address', zh: '住址', en: 'Home address', known: 'Household registration' },
  { key: 'app.date', zh: '申請日期', en: 'Application date', known: 'System' },
  { key: 'company.address', zh: '公司所在地', en: 'Registered address' },
  { key: 'company.capital', zh: '資本總額', en: 'Capital' },
  { key: 'owner.name', zh: '建物所有權人', en: 'Building owner' },
];

// form → fact → the label the "AI" found in that form (verbatim from the official PDF text)
const FOUND = {
  c00001: { 'company.name': '預查公司名稱', 'company.items': '所營事業', 'person.name': '申請人姓名', 'person.nationalId': '身分證統一編號', 'person.address': '申請人住所', 'person.phone': '聯絡電話' },
  app: { 'reservation.id': '預查編號', 'company.name': '公司名稱', 'person.name': '代表人姓名', 'company.address': '公司所在地（含鄉鎮市區村里）', 'person.phone': '聯絡電話', 'app.date': '申請日期　年　月　日' },
  t70126: { 'company.name': '定名為＿＿有限公司', 'company.items': '本公司經營之事業如下', 'company.address': '本公司設於＿＿（縣／市）', 'company.capital': '本公司資本總額定為新臺幣＿＿元', 'person.name': '股東姓名或名稱及其出資額', 'app.date': '中華民國　年　月　日' },
  t70130: { 'company.name': '＿＿有限公司 股東同意書', 'person.name': '股東姓名（親自簽名）', 'app.date': '中華民國　年　月　日' },
  t70132: { 'company.name': '本人同意擔任＿＿有限公司董事', 'person.name': '立同意書人', 'app.date': '中華民國　年　月　日' },
  t70124: { 'company.address': '所有座落於（門牌號碼）之房屋', 'company.name': '同意（公司名稱）登記為所在地', 'owner.name': '立同意書人（姓名）簽名或蓋章', 'app.date': '中華民國　年　月　日' },
  t70135: { 'reservation.id': '公司預查編號', 'person.phone': '公司聯絡電話', 'company.name': '公司名稱 中文＿＿有限公司', 'company.address': '（郵遞區號）公司所在地', 'company.capital': '資本總額 新台幣＿＿元', 'person.name': '代表人姓名', 'person.nationalId': '董事 身分證號', 'person.address': '董事 住所或居所', 'app.date': '公司章程訂定日期' },
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const boxes = Object.values(FOUND).reduce((n, f) => n + Object.keys(f).length, 0);
const ask = FACTS.filter((f) => !f.known);

const st = { phase: 'idle', read: {}, approved: new Set(), pick: null };
const $root = document.getElementById('root');

function render() {
  const allRead = FORMS.every((f) => st.read[f.id] === 'done');
  $root.innerHTML = `
    <section class="intro">
      <div class="eyebrow zh">有限公司設立登記 · Limited company registration</div>
      <h1>Turn this page's forms into<br>one short conversation.</h1>
      <p>Zero Form reads every form on <a href="${PAGE}" target="_blank">the registration page</a> once, finds the boxes that ask for the same thing, and merges them. You review the result, then publish it to the website button. Applicants never see the paperwork.</p>
    </section>

    <section class="step ${st.phase === 'idle' ? 'active' : 'done'}">
      <div class="sh"><span class="n">1</span><h2>Read the forms</h2>${allRead ? `<span class="okp">✓ ${FORMS.length} forms read</span>` : ''}</div>
      <div class="forms">${FORMS.map((f) => {
        const s = st.read[f.id];
        const n = Object.keys(FOUND[f.id]).length;
        return `<div class="form ${s || ''}"><div class="ic">PDF</div><div class="t"><div class="zh nm">${f.name}</div><div class="en">${f.en} · <a href="${f.url}" target="_blank">source</a></div></div>
          <div class="state">${s === 'done' ? `<span class="okp">${n} boxes found</span>` : s === 'reading' ? '<span class="rd"><i></i>Reading…</span>' : '<span class="wait">Waiting</span>'}</div></div>`;
      }).join('')}</div>
      ${st.phase === 'idle' ? `<button class="btn primary" data-go="read">✦ Read ${FORMS.length} forms with AI</button><div class="note">Runs once per service. Takes a few seconds.</div>` : ''}
    </section>

    ${st.phase === 'idle' || st.phase === 'reading' ? '' : `
    <section class="step ${st.phase === 'review' ? 'active' : 'done'}">
      <div class="sh"><span class="n">2</span><h2>Check what was merged</h2></div>
      <div class="stats">
        <div><b>${boxes}</b><span>boxes on paper</span></div><i>→</i>
        <div><b>${FACTS.length}</b><span>shared facts</span></div><i>→</i>
        <div class="hl"><b>${ask.length}</b><span>questions for applicants</span></div>
      </div>
      <p class="sub">${FACTS.length - ask.length} facts come from records the applicant already verified. Click a dot to see the exact box the AI matched. Approve each row.</p>
      <div class="matrix">
        <table>
          <thead><tr><th>Shared fact</th>${FORMS.map((f) => `<th class="fc" title="${esc(f.name)}"><span class="zh">${f.name.length > 6 ? f.name.slice(0, 5) + '…' : f.name}</span></th>`).join('')}<th>Comes from</th><th></th></tr></thead>
          <tbody>${FACTS.map((x) => `<tr class="${st.approved.has(x.key) ? 'ok' : ''}">
            <td><div class="zh fk">${x.zh}</div><div class="en">${x.en}</div></td>
            ${FORMS.map((f) => FOUND[f.id][x.key] ? `<td class="c"><button class="dot ${st.pick === f.id + x.key ? 'on' : ''}" data-pick="${f.id}|${x.key}" title="${esc(FOUND[f.id][x.key])}"></button></td>` : '<td class="c"></td>').join('')}
            <td>${x.known ? `<span class="src">${x.known}</span>` : '<span class="askp">Ask applicant once</span>'}</td>
            <td><button class="ap" data-ap="${x.key}">${st.approved.has(x.key) ? '✓ Approved' : 'Approve'}</button></td></tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="evidence">${st.pick ? (() => { const [fid, k] = st.pick.split('|'); const f = FORMS.find((x) => x.id === fid); const fact = FACTS.find((x) => x.key === k);
        return `<span class="lbl">Found in <b class="zh">${f.name}</b>:</span> <span class="zh q">「${esc(FOUND[fid][k])}」</span> <span class="lbl">→ ${fact.en}</span>`; })() : '<span class="lbl">Tip: click any dot to see the box it came from.</span>'}</div>
      ${st.phase === 'review' ? `<div class="row"><button class="btn ghost" data-go="approveAll">Approve all ${FACTS.length}</button>
        <button class="btn primary" data-go="publish" ${st.approved.size < FACTS.length ? 'disabled' : ''}>Publish to the website button</button></div>` : ''}
    </section>`}

    ${st.phase !== 'live' ? '' : `
    <section class="step active">
      <div class="sh"><span class="n">3</span><h2>Live</h2><span class="okp">● Published</span></div>
      <p class="sub">Applicants on the registration page now answer <b>${ask.length} questions</b> instead of filling ${FORMS.length} forms. Add this line to the page — or use the browser extension until you do:</p>
      <pre class="code">&lt;script src="https://zeroform.app/embed.js" data-service="tw-company-ltd-incorporation"&gt;&lt;/script&gt;</pre>
      <div class="row"><a class="btn primary" href="/" target="_blank">Open the applicant view →</a><a class="btn ghost" href="/officer.html" target="_blank">Officer console</a></div>
    </section>`}

    <p class="foot">Demo note: the AI step is simulated — this mapping was prepared from the official forms' text. In production a model proposes it and an officer approves every row before anything goes live.</p>`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ACT = {
  async read() {
    st.phase = 'reading'; render();
    for (const f of FORMS) { st.read[f.id] = 'reading'; render(); await sleep(450); st.read[f.id] = 'done'; render(); }
    await sleep(300); st.phase = 'review'; render();
    document.querySelector('.step.active')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  approveAll() { FACTS.forEach((x) => st.approved.add(x.key)); render(); },
  publish() { st.phase = 'live'; render(); document.querySelector('.step:last-of-type')?.scrollIntoView({ behavior: 'smooth' }); },
};
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]')?.dataset.go;
  const pick = e.target.closest('[data-pick]')?.dataset.pick;
  const ap = e.target.closest('[data-ap]')?.dataset.ap;
  if (go) ACT[go]();
  if (pick) { st.pick = pick; render(); }
  if (ap && st.phase === 'review') { st.approved.has(ap) ? st.approved.delete(ap) : st.approved.add(ap); render(); }
});
render();
