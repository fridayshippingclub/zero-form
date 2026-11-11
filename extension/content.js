// Zero Form — content script for tcooc-co.gov.taipei
// Injects (1) a hero card under the 設立登記 title bar, (2) a banner above the Step 4 "應備文件" table,
// (3) a floating launcher, and (4) a right-side drawer that frames the Zero Form app. All UI lives in Shadow DOM.
(() => {
  if (window.__zeroFormInjected) return;
  window.__zeroFormInjected = true;

  const APP_URL = 'http://localhost:5173/?embed=1&demo=1';
  const FONT = `"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  // Same glyph as public/logo-mark.svg.
  const GLYPH = 'M31 12C21.6 12 16 18.4 16 28v8c0 10 5.7 16 16 16s16-6 16-16V25L35 12h-4Zm0 8c-4.7 0-7 3-7 8v8c0 5.5 2.5 8 8 8s8-2.5 8-8v-8l-8-8h-1Z';
  const logo = (size, inverted = false, color = '#2B50FF') => `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="17" fill="${inverted ? '#fff' : color}"/><path fill="${inverted ? '#2B50FF' : '#fff'}" fill-rule="evenodd" d="${GLYPH}"/></svg>`;

  const BASE_CSS = `
    :host { all: initial; }
    *, *::before, *::after { box-sizing: border-box; }
    .zf { font-family: ${FONT}; -webkit-font-smoothing: antialiased; color: #0E1116; line-height: 1.5; }
    .logo { display: block; flex: none; }
    button { font-family: inherit; cursor: pointer; }
    .go { flex: none; height: 38px; padding: 0 16px; border: 0; border-radius: 6px; background: #2B50FF; color: #fff;
      font-size: 14px; font-weight: 500; white-space: nowrap; transition: background .15s ease; }
    .go:hover { background: #1F42E6; }
    .go:focus-visible { outline: 3px solid #0E1116; outline-offset: 2px; }
  `;
  // ---------- Floating launcher + drawer (one fixed host on <html>) ----------
  const host = document.createElement('div');
  host.id = 'zero-form-root';
  host.style.cssText = 'all: initial; position: fixed; inset: auto; z-index: 2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      ${BASE_CSS}
      .launcher { position: fixed; right: 24px; bottom: 24px; z-index: 3; height: 46px;
        display: inline-flex; align-items: center; gap: 8px; padding: 0 16px 0 12px;
        background: #fff; color: #2B50FF; border: 1px solid #D9DCE1; border-radius: 20px;
        font-size: 14px; font-weight: 500; box-shadow: 0 2px 8px rgba(14,17,22,.10);
        opacity: 0; transform: translateY(12px); transition: transform .35s cubic-bezier(.2,.8,.2,1), opacity .3s ease, border-color .15s ease; }
      .launcher.in { opacity: 1; transform: none; }
      .launcher.in:hover { border-color: #2B50FF; }
      .launcher:focus-visible { outline: 3px solid #2B50FF; outline-offset: 2px; }
      :host([data-open]) .launcher { opacity: 0; pointer-events: none; }
      @media (prefers-reduced-motion: reduce) { .launcher, .drawer, .scrim { transition: none !important; } .launcher { transform: none; } }

      .scrim { position: fixed; inset: 0; z-index: 1; background: rgba(14,17,22,.38);
        opacity: 0; pointer-events: none; transition: opacity .25s ease; }
      :host([data-open]) .scrim { opacity: 1; pointer-events: auto; }

      .drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 2; width: min(1100px, 76vw); max-width: 100vw;
        background: #fff; display: flex; flex-direction: column;
        box-shadow: -24px 0 60px rgba(14,17,22,.22), -2px 0 8px rgba(14,17,22,.08);
        transform: translateX(105%); transition: transform .32s cubic-bezier(.2,.8,.2,1); visibility: hidden; }
      @media (max-width: 760px) { .drawer { width: 100vw; } }
      :host([data-open]) .drawer { transform: translateX(0); visibility: visible; }
      .bar { display: flex; align-items: center; gap: 10px; height: 56px; padding: 0 12px 0 18px;
        border-bottom: 1px solid #E6E6E1; flex: none; }
      .title { font-family: Inter, sans-serif; font-size: 15px; font-weight: 700; letter-spacing: -.01em; }
      .title small { font-family: ${FONT}; font-weight: 400; color: #8A909C; margin-left: 6px; font-size: 13px; }
      .demo { margin-left: auto; font-size: 12px; color: #6B7280; border: 1px solid #D9DCE1;
        padding: 2px 8px; border-radius: 6px; white-space: nowrap; }
      .close { width: 36px; height: 36px; border: 0; border-radius: 8px; background: transparent;
        color: #0E1116; font-size: 24px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; }
      .close:hover { background: #F2F2EE; }
      .close:focus-visible { outline: 3px solid #2B50FF; outline-offset: 1px; }
      @media (max-width: 560px) { .title small { display: none; } .demo { font-size: 11px; } }
      iframe { flex: 1; width: 100%; border: 0; display: block; background: #fff; }
    </style>
    <div class="zf">
      <button class="launcher" part="launcher" aria-label="線上填寫 7 份設立文件 · Fill all 7 forms online (Zero Form)">
        ${logo(22)}<b style="font-family:Inter,sans-serif;font-weight:700;letter-spacing:-0.2px">Zero Form</b><span style="opacity:.75">線上填寫 · Fill online</span>
      </button>
      <div class="scrim"></div>
      <aside class="drawer" role="dialog" aria-label="Zero Form" aria-modal="true">
        <div class="bar">
          ${logo(26)}
          <span class="title">Zero Form<small>公司設立登記</small></span>
          <span class="demo">展示版 · Demo — not a government submission</span>
          <button class="close" aria-label="關閉 · Close">×</button>
        </div>
      </aside>
    </div>
  `;
  (document.documentElement || document.body).appendChild(host);

  const drawer = root.querySelector('.drawer');
  const launcher = root.querySelector('.launcher');
  let iframe = null;

  function open() {
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.src = APP_URL;
      iframe.title = 'Zero Form';
      // Chrome Local Network Access (public HTTPS page -> localhost).
      iframe.setAttribute('allow', 'publickey-credentials-get *; publickey-credentials-create *; local-network-access *; local-network *; loopback-network *');
      drawer.appendChild(iframe);
    }
    host.setAttribute('data-open', '');
    setTimeout(() => iframe && iframe.focus(), 320);
  }
  function close() { host.removeAttribute('data-open'); launcher.focus(); }

  launcher.addEventListener('click', open);
  root.querySelector('.scrim').addEventListener('click', close);
  root.querySelector('.close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && host.hasAttribute('data-open')) close(); });
  window.__zeroFormOpen = open;

  // Entrance: a quiet slide-in after ~600ms, then still.
  setTimeout(() => launcher.classList.add('in'), 600);

  const mount = (id, css, html, place) => {
    const h = document.createElement('div');
    h.id = id;
    h.style.cssText = css;
    const s = h.attachShadow({ mode: 'open' });
    s.innerHTML = html;
    s.querySelectorAll('.go').forEach((b) => b.addEventListener('click', open));
    place(h);
    return true;
  };

  // ---------- Hero card: right under the 設立登記 title bar, above the 作業規範 tab row ----------
  function insertHero() {
    if (document.getElementById('zero-form-hero')) return true;
    const tab = [...document.querySelectorAll('li, a, span')].find((e) => e.textContent.trim() === '作業規範');
    const row = tab && (tab.closest('.list-text') || tab.closest('ul'));
    if (!row || !row.parentNode) return false;
    return mount('zero-form-hero', 'all: initial; display: block; margin: 6px 0 16px;', `
      <style>${BASE_CSS}
        .notice { display: flex; align-items: center; gap: 16px; padding: 14px 16px; background: #fff;
          border: 1px solid #D9DCE1; border-left: 3px solid #2B50FF; border-radius: 4px; }
        .txt { flex: 1; min-width: 0; }
        .l1 { margin: 0; font-size: 16px; font-weight: 500; color: #0E1116; }
        .l2 { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin-top: 2px; font-size: 13px; color: #6B7280; }
        .brandblk { display: flex; align-items: center; gap: 10px; padding-right: 16px; margin-right: 2px; border-right: 1px solid #E6E6E1; flex: none; }
        .brandblk .bw { display: flex; flex-direction: column; line-height: 1.2; }
        .brandblk b { font-family: Inter, sans-serif; font-size: 17px; font-weight: 700; letter-spacing: -0.3px; color: #0E1116; }
        .brandblk small { font-size: 12px; color: #2B50FF; font-weight: 500; margin-top: 2px; }
        .txt { flex: 1; min-width: 0; }
        .by { display: inline-flex; align-items: center; gap: 5px; font-family: Inter, sans-serif; font-size: 12px; font-weight: 600; }
        @media (max-width: 640px) { .notice { flex-wrap: wrap; } .go { width: 100%; } }
      </style>
      <section class="zf notice" aria-label="線上辦理 · Zero Form">
        <div class="brandblk">${logo(36)}<div class="bw"><b>Zero Form</b><small>零表單 · 線上辦理</small></div></div>
        <div class="txt">
          <p class="l1">線上辦理：回答 3 題，自動產生全部 7 份設立文件</p>
          <p class="l1" style="font-size:14px;font-weight:500;color:#4A5160;margin-top:2px">Apply online: answer 3 questions, all 7 registration forms are prepared for you.</p>
          <div class="l2"><span>簡訊驗證 · 送出前可逐項核對 · 展示版，非政府送件 / SMS-verified · review before sending · demo, not a government submission</span></div>
        </div>
        <button class="go">線上填寫 · Start online</button>
      </section>`, (h) => row.parentNode.insertBefore(h, row));
  }

  // ---------- Banner above the Step 4 "應備文件" table ----------
  function findStep4Table() {
    const heads = document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,strong,div');
    for (const el of heads) {
      const t = (el.textContent || '').trim();
      if (!t.includes('應備文件') || t.length > 40) continue;
      if (!/step\s*4/i.test(t) && el.tagName.length !== 2) continue; // prefer "Step 4" headings
      let n = el.nextElementSibling;
      for (let i = 0; n && i < 4; i++, n = n.nextElementSibling) {
        if (n.tagName === 'TABLE') return n;
        const inner = n.querySelector && n.querySelector('table');
        if (inner) return inner;
      }
    }
    return null;
  }
  function insertBanner() {
    if (document.getElementById('zero-form-banner')) return true;
    const table = findStep4Table();
    if (!table) return false;
    return mount('zero-form-banner', 'all: initial; display: block; margin: 4px 0 10px;', `
      <style>${BASE_CSS}
        .start { all: unset; cursor: pointer; font-family: ${FONT}; font-size: 14px; color: #2B50FF; text-decoration: underline; text-underline-offset: 3px; }
        .start:hover { color: #1F42E6; }
        .start:focus-visible { outline: 2px solid #2B50FF; outline-offset: 2px; }
        small { font-size: 12px; color: #6B7280; margin-left: 6px; }
      </style>
      <p class="zf" style="margin:0;display:flex;align-items:center;gap:8px">${logo(20)}<button class="go start">這 7 份文件可線上一次填寫（回答 3 題）· Fill all 7 online (3 questions) →</button><small>Zero Form 展示版 · Demo</small></p>`, (h) => table.parentNode.insertBefore(h, table));
  }

  const tryAll = () => insertHero() & insertBanner();
  if (!tryAll()) {
    let tries = 0; // content may render late; retry briefly
    const iv = setInterval(() => { if (tryAll() || ++tries > 20) clearInterval(iv); }, 500);
  }
})();
