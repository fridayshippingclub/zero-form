const KEY = 'zero-form-language';
const VALID = ['bi', 'en', 'zh'];
let selected = 'bi';
try { const saved = localStorage.getItem(KEY); if (VALID.includes(saved)) selected = saved; } catch {}

export const language = () => selected;
export const t = (zh, en, separator = ' · ') => selected === 'en' ? en : selected === 'zh' ? zh : `${zh}${separator}${en}`;

export function mountLanguageSwitch(onChange) {
  const group = document.createElement('nav');
  group.className = 'language-switch';
  group.setAttribute('aria-label', 'Language / 語言');
  const buttons = [['en', 'English'], ['zh', '中文'], ['bi', '雙語']].map(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label; button.dataset.language = value;
    button.addEventListener('click', () => {
      if (selected === value) return;
      selected = value;
      try { localStorage.setItem(KEY, value); } catch {}
      refresh(); onChange();
    });
    group.append(button); return button;
  });
  const refresh = () => {
    document.documentElement.lang = selected === 'en' ? 'en' : 'zh-Hant';
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.language === selected)));
    document.querySelectorAll('[data-language-zh][data-language-en]').forEach(el => { el.textContent = t(el.dataset.languageZh, el.dataset.languageEn); });
  };
  document.querySelector('.top').append(group);
  window.addEventListener('storage', event => {
    if (event.key !== KEY) return;
    selected = VALID.includes(event.newValue) ? event.newValue : 'bi';
    refresh(); onChange();
  });
  refresh();
}
