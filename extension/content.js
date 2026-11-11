// Zero Form — content script for tcooc-co.gov.taipei
// Injects a floating launcher, an inline banner above the Step 4 "應備文件" table,
// and a right-side drawer that frames the Zero Form app. All UI lives in Shadow DOM.
(() => {
  if (window.__zeroFormInjected) return;
  window.__zeroFormInjected = true;

  const APP_URL = 'http://localhost:5173/';
  const FONT = `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", Roboto, Helvetica, Arial, sans-serif`;

  const BASE_CSS = `
    :host { all: initial; }
    *, *::before, *::after { box-sizing: border-box; }
    .zf { font-family: ${FONT}; -webkit-font-smoothing: antialiased; color: #0E1116; line-height: 1.4; }
    .mark { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px;
      border-radius: 6px; background: #2B50FF; color: #fff; font-weight: 700; font-size: 13px; line-height: 1; flex: none; }
    button { font-family: inherit; cursor: pointer; }
  `;

  // ---------- Floating launcher + drawer (one fixed host on <html>) ----------
  const host = document.createElement('div');
  host.id = 'zero-form-root';
  host.style.cssText = 'all: initial; position: fixed; inset: auto; z-index: 2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      ${BASE_CSS}
      .launcher { position: fixed; right: 24px; bottom: 24px; z-index: 3;
        display: inline-flex; align-items: center; gap: 10px; padding: 12px 18px 12px 12px;
        background: #0E1116; color: #fff; border: 0; border-radius: 999px;
        font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
        box-shadow: 0 10px 30px rgba(14,17,22,.28), 0 2px 6px rgba(14,17,22,.2);
        transition: transform .15s ease, box-shadow .15s ease, opacity .2s ease; }
      .launcher:hover { transform: translateY(-1px); box-shadow: 0 14px 36px rgba(14,17,22,.32), 0 2px 6px rgba(14,17,22,.2); }
      .launcher:focus-visible { outline: 3px solid #2B50FF; outline-offset: 3px; }
      :host([data-open]) .launcher { opacity: 0; pointer-events: none; }

      .scrim { position: fixed; inset: 0; z-index: 1; background: rgba(14,17,22,.38);
        opacity: 0; pointer-events: none; transition: opacity .25s ease; }
      :host([data-open]) .scrim { opacity: 1; pointer-events: auto; }

      .drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 2; width: min(1000px, 74vw); max-width: 100vw;
        background: #fff; display: flex; flex-direction: column;
        box-shadow: -24px 0 60px rgba(14,17,22,.22), -2px 0 8px rgba(14,17,22,.08);
        transform: translateX(105%); transition: transform .32s cubic-bezier(.2,.8,.2,1); visibility: hidden; }
      :host([data-open]) .drawer { transform: translateX(0); visibility: visible; }
      .bar { display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 12px 0 16px;
        border-bottom: 1px solid #E6E6E1; flex: none; }
      .title { font-size: 14px; font-weight: 600; flex: 1; }
      .title small { font-weight: 500; color: #6B6F76; margin-left: 6px; }
      .close { width: 32px; height: 32px; border: 0; border-radius: 8px; background: transparent;
        color: #0E1116; font-size: 22px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; }
      .close:hover { background: #F2F2EE; }
      iframe { flex: 1; width: 100%; border: 0; display: block; background: #fff; }
    </style>
    <div class="zf">
      <button class="launcher" part="launcher" aria-label="Fill all 7 forms with Zero Form">
        <span class="mark">0</span><span>Fill all 7 forms with Zero Form</span>
      </button>
      <div class="scrim"></div>
      <aside class="drawer" role="dialog" aria-label="Zero Form" aria-modal="true">
        <div class="bar">
          <span class="mark">0</span>
          <span class="title">Zero Form<small>公司設立登記</small></span>
          <button class="close" aria-label="Close">×</button>
        </div>
      </aside>
    </div>
  `;
  (document.documentElement || document.body).appendChild(host);

  const drawer = root.querySelector('.drawer');
  let iframe = null;

  function open() {
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.src = APP_URL;
      iframe.title = 'Zero Form';
      // WebAuthn in a cross-origin iframe + Chrome Local Network Access (public HTTPS page -> localhost).
      iframe.setAttribute('allow', 'publickey-credentials-get *; publickey-credentials-create *; local-network-access *; local-network *; loopback-network *');
      drawer.appendChild(iframe);
    }
    host.setAttribute('data-open', '');
    setTimeout(() => iframe && iframe.focus(), 320);
  }
  function close() { host.removeAttribute('data-open'); }

  root.querySelector('.launcher').addEventListener('click', open);
  root.querySelector('.scrim').addEventListener('click', close);
  root.querySelector('.close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && host.hasAttribute('data-open')) close(); });
  window.__zeroFormOpen = open;

  // ---------- Inline banner above the Step 4 "應備文件" table ----------
  function findStep4Table() {
    const heads = document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,strong,div');
    for (const el of heads) {
      const t = (el.textContent || '').trim();
      if (!t.includes('應備文件') || t.length > 40) continue;
      if (!/step\s*4/i.test(t) && el.tagName.length !== 2) continue; // prefer "Step 4" headings
      // Next table after this element (sibling first, then document order).
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
    const bhost = document.createElement('div');
    bhost.id = 'zero-form-banner';
    bhost.style.cssText = 'all: initial; display: block; margin: 12px 0 16px;';
    const b = bhost.attachShadow({ mode: 'open' });
    b.innerHTML = `
      <style>
        ${BASE_CSS}
        .card { display: flex; align-items: center; gap: 14px; padding: 16px 16px 16px 18px;
          background: #fff; border: 1px solid #E6E6E1; border-radius: 12px;
          box-shadow: 0 1px 2px rgba(14,17,22,.04); }
        .card .mark { width: 28px; height: 28px; border-radius: 8px; font-size: 15px; }
        .text { flex: 1; font-size: 15px; color: #0E1116; }
        .text b { font-weight: 600; }
        .start { flex: none; padding: 10px 18px; border: 0; border-radius: 999px; background: #0E1116; color: #fff;
          font-size: 14px; font-weight: 600; transition: background .15s ease; }
        .start:hover { background: #2B50FF; }
        .start:focus-visible { outline: 3px solid #2B50FF; outline-offset: 2px; }
      </style>
      <div class="zf card">
        <span class="mark">0</span>
        <div class="text"><b>Skip the paperwork</b> — answer 3 questions once, confirm with a text code, and Zero Form prepares all 7 forms.</div>
        <button class="start">Start</button>
      </div>
    `;
    b.querySelector('.start').addEventListener('click', open);
    table.parentNode.insertBefore(bhost, table);
    return true;
  }

  if (!insertBanner()) {
    // Content may render late; retry briefly.
    let tries = 0;
    const iv = setInterval(() => { if (insertBanner() || ++tries > 20) clearInterval(iv); }, 500);
  }
})();
