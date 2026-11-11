// Agency setup, done ONCE per service: read the official forms, merge overlapping fields into
// shared facts, show what the applicant still has to type, approve, publish.
// Two modes: "Live" sends each PDF to Claude (POST /api/setup/read {mode:'ai'}) and locates the labels it returns;
// "Demo" replays a mapping prepared from the same PDFs (works offline). Field positions are real in both.

const PAGE = 'https://tcooc-co.gov.taipei/cp.aspx?n=1ddc8c221b97a1bd&s=5BA095ECA5D6FAB3';
const FACTS = {
  'company.name':    { zh: '公司名稱', en: 'Company name', color: '#2B50FF', known: 'Name reservation' },
  'person.name':     { zh: '負責人姓名', en: 'Representative', color: '#7C3AED', known: 'MOI identity' },
  'reservation.id':  { zh: '預查編號', en: 'Reservation no.', color: '#0D9488', known: 'Name reservation' },
  'person.phone':    { zh: '聯絡電話', en: 'Phone', color: '#DB2777', known: 'Verified by SMS' },
  'app.date':        { zh: '日期', en: 'Date', color: '#64748B', known: 'System' },
  'company.items':   { zh: '所營事業', en: 'Business items', color: '#16A34A', known: 'Name reservation' },
  'company.address': { zh: '公司所在地', en: 'Registered address', color: '#EA580C' },
  'company.capital': { zh: '資本總額', en: 'Capital', color: '#CA8A04' },
  'person.nationalId': { zh: '身分證字號', en: 'National ID', color: '#0891B2', known: 'MOI identity' },
  'person.address':  { zh: '住址', en: 'Home address', color: '#9333EA', known: 'Household registration' },
  'owner.name':      { zh: '建物所有權人', en: 'Building owner', color: '#BE123C' },
};
const fact = (k) => FACTS[k] ?? { zh: k, en: k, color: '#94A3B8' };

const st = { phase: 'idle', forms: [], shown: {}, focus: null, mode: new URLSearchParams(location.search).get('mode') === 'demo' ? 'demo' : 'ai', meta: null, error: '' };
const $root = document.getElementById('root');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const total = () => st.forms.reduce((n, f) => n + f.fields.length, 0);
const found = () => Object.values(st.shown).reduce((n, v) => n + v, 0);
const factKeys = () => [...new Set(st.forms.flatMap((f) => f.fields.map((x) => x.fact)))];
const usage = (k) => st.forms.reduce((n, f) => n + f.fields.filter((x) => x.fact === k).length, 0);
const merged = () => ['merge', 'result', 'live'].includes(st.phase);

function page(f) {
  const n = st.shown[f.id] ?? 0;
  return `<figure class="pg">
    <div class="sheet" style="aspect-ratio:1/${f.aspect}"><img src="${f.image}" alt="${esc(f.name)}">
      ${f.fields.map((x, i) => {
        const c = fact(x.fact);
        return `<span class="box ${i < n ? 'on' : ''} ${merged() ? 'm' : ''}" data-fact="${x.fact}" title="${esc(x.label)} → ${c.en}"
          style="left:${x.box[0]}%;top:${x.box[1]}%;width:${x.box[2]}%;height:${x.box[3]}%;--c:${merged() ? c.color : '#2B50FF'}">${merged() ? `<em>${c.en}</em>` : ''}</span>`;
      }).join('')}
      <div class="beam"></div></div>
    <figcaption><b class="zh">${f.name}</b><span>${f.en} · <a href="${f.source}" target="_blank">official PDF</a> · <b class="fc" data-count="${f.id}">${n}</b> fields</span></figcaption></figure>`;
}

function render() {
  const keys = factKeys(), ask = keys.filter((k) => !fact(k).known), known = keys.filter((k) => fact(k).known);
  const counter = st.phase === 'idle' ? '' : `
    <div class="eq">
      <div><b id="found">${st.phase === 'scan' ? found() : total()}</b><span>fields on ${st.forms.length} forms</span></div>
      ${merged() ? `<i>→</i><div><b>${keys.length}</b><span>different facts</span></div>` : ''}
      ${['result', 'live'].includes(st.phase) ? `<i>→</i><div class="hl"><b>${ask.length}</b><span>the applicant types</span></div>` : ''}
    </div>`;
  const next = {
    idle: `<div class="mode">${[['ai', 'Live · Claude reads the PDFs'], ['demo', 'Demo · offline replay']].map(([m, l]) => `<button data-mode="${m}" class="${st.mode === m ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button class="btn blue" data-go="scan">✦ Read the forms with ${st.mode === 'ai' ? 'Claude' : 'AI'}</button>${st.error ? `<div class="err">${esc(st.error)}</div>` : ''}`,
    scan: '',
    found: `<button class="btn blue" data-go="merge">Merge fields that ask for the same thing →</button>`,
    merge: `<button class="btn blue" data-go="result">Show what the applicant still types →</button>`,
    result: `<button class="btn dark" data-go="publish">Approve & publish to the website button</button>`,
    live: '',
  }[st.phase];

  $root.innerHTML = `
    <section class="intro">
      <div class="eyebrow zh">臺北市商業處 · 有限公司設立登記 · <a href="${PAGE}" target="_blank">registration page</a></div>
      <h1>${{ idle: 'Three official forms. One applicant.', scan: 'Reading every field…', found: `${total()} fields to fill by hand.`, merge: `${total()} fields, but only ${keys.length} different facts.`, result: `The applicant types ${ask.length} things.`, live: 'Live on the website.' }[st.phase]}</h1>
      <p>${{ idle: 'Today an applicant downloads these forms and writes the same company name, address and representative again and again. Zero Form reads them once — this setup happens one time, by the agency.',
        scan: 'The AI finds each box that asks the applicant for information.',
        found: 'Many of these boxes ask for the same thing. Next, Zero Form matches them.',
        merge: 'Same colour = same fact. Hover a colour to see everywhere it appears.',
        result: `${known.length} facts come from records the applicant already verified. Only ${ask.length} are new.`,
        live: 'An officer approved the mapping. The button on the registration page now uses it.' }[st.phase]}</p>
      ${counter}
      <div class="status" id="status">${st.meta && st.phase !== 'idle' ? (st.meta.mode === 'ai'
        ? `✦ Read by Claude (<span class="mono">${st.meta.model}</span>) in ${st.meta.secs}s${st.meta.other ? ` · ${st.meta.other} other boxes (agent details, optional, official use) set aside for the reviewer` : ''}`
        : 'Demo mode · offline replay of the mapping') : ''}</div>
    </section>

    <section class="pages">${st.forms.map(page).join('')}</section>

    ${merged() ? `<section class="legend">${keys.sort((a, b) => usage(b) - usage(a)).map((k) => { const c = fact(k); const isAsk = !c.known && ['result', 'live'].includes(st.phase);
      return `<div class="fact ${isAsk ? 'ask' : ''} ${['result', 'live'].includes(st.phase) && c.known ? 'kn' : ''}" data-fact="${k}" style="--c:${c.color}">
        <span class="sw"></span><div class="t"><b class="zh">${c.zh}</b><span>${c.en}</span></div><span class="ct">×${usage(k)}</span>
        ${['result', 'live'].includes(st.phase) ? (c.known ? `<span class="src">✓ ${c.known}</span>` : '<span class="askp">Applicant types once</span>') : ''}</div>`; }).join('')}</section>` : ''}

    ${st.phase === 'live' ? `<section class="live">
      <p>Add one line to the registration page — or use the browser extension until then:</p>
      <pre>&lt;script src="https://zeroform.app/embed.js" data-service="tw-company-ltd-incorporation"&gt;&lt;/script&gt;</pre>
      <div class="row"><a class="btn dark" href="/" target="_blank">Open the applicant view →</a><a class="btn ghost" href="/officer.html" target="_blank">Officer console</a></div></section>` : ''}

    <div class="cta">${next}</div>
    <p class="foot">${st.mode === 'ai' ? 'Live: Claude reads each official PDF and proposes the mapping; box positions come from the PDF text layer.' : 'Demo mode: replays a mapping prepared from the same official PDFs, so it works offline.'} An officer approves the mapping before it goes live.</p>`;
}

const ACT = {
  async scan() {
    st.phase = 'scan'; st.error = ''; st.meta = null;
    st.forms.forEach((f) => (st.shown[f.id] = 0)); render();
    document.querySelectorAll('figure').forEach((f) => f.classList.add('scan'));
    document.getElementById('status').innerHTML = `<span class="rd"><i></i>${st.mode === 'ai' ? 'Claude is reading 3 official PDFs…' : 'Reading 3 forms…'}</span>`;
    const t0 = performance.now();
    try {
      const r = await fetch('/api/setup/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: st.mode }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Reading failed');
      st.forms = data.forms;
      st.meta = { mode: data.mode, model: data.model, secs: ((performance.now() - t0) / 1000).toFixed(1), other: data.forms.reduce((n, f) => n + (f.other || 0), 0) };
    } catch (e) { st.phase = 'idle'; st.error = `${e.message} — try Demo mode.`; render(); return; }
    st.forms.forEach((f) => (st.shown[f.id] = 0)); render();
    for (const f of st.forms) {
      const fig = document.querySelector(`[data-count="${f.id}"]`).closest('figure');
      fig.classList.add('scan'); await sleep(350);
      const boxes = fig.querySelectorAll('.box');
      for (let i = 1; i <= f.fields.length; i++) {
        st.shown[f.id] = i; boxes[i - 1].classList.add('on');
        fig.querySelector('.fc').textContent = i; document.getElementById('found').textContent = found();
        await sleep(260);
      }
      fig.classList.remove('scan');
    }
    st.phase = 'found'; render();
  },
  merge() { st.phase = 'merge'; render(); },
  result() { st.phase = 'result'; render(); },
  publish() { st.phase = 'live'; render(); setTimeout(() => document.querySelector('.live')?.scrollIntoView({ behavior: 'smooth' }), 50); },
};
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]')?.dataset.go; if (go) ACT[go]();
  const m = e.target.closest('[data-mode]')?.dataset.mode; if (m && st.phase === 'idle') { st.mode = m; st.error = ''; render(); }
});
document.addEventListener('mouseover', (e) => {
  const f = merged() ? e.target.closest('[data-fact]')?.dataset.fact ?? null : null;
  if (f === st.focus) return;
  st.focus = f;
  document.querySelectorAll('.box, .fact').forEach((el) => el.classList.toggle('dim', !!f && el.dataset.fact !== f));
});

st.forms = await (await fetch('/setup/fields.json')).json();
render();
