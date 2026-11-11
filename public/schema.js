// Shared by server + browser. One semantic fact → many forms.
// Roles stay distinct even when this one-person scenario binds them to one identity.
export const ROLE_BINDINGS = { applicant: 'person-applicant', representative: 'person-applicant', director: 'person-applicant' };
export const FIELDS = {
  'person.name':        { label: '負責人姓名', en: 'Representative', type: 'text' },
  'person.nationalId':  { label: '身分證字號', en: 'National ID', type: 'nationalId' },
  'person.phone':       { label: '聯絡電話', en: 'Phone', type: 'phone' },
  'person.address':     { label: '住址', en: 'Home address', type: 'address' },
  'company.name':       { label: '公司名稱', en: 'Company name', type: 'text', suffix: '有限公司' },
  'company.address':    { label: '公司所在地', en: 'Registered address', type: 'address' },
  'company.capital':    { label: '資本總額', en: 'Capital (NT$)', type: 'money' },
  'company.items':      { label: '所營事業', en: 'Business items', type: 'text' },
  'owner.name':         { label: '建物所有權人', en: 'Building owner', type: 'text' },
  'app.date':           { label: '申請日期', en: 'Application date', type: 'date' },
};

export const FORMS = [
  { id: 'c00001', name: '公司名稱及所營事業登記預查申請表', en: 'Name reservation', onFile: true,
    fieldRoles: { 'person.name': 'applicant', 'person.nationalId': 'applicant' },
    fields: ['company.name', 'company.items', 'person.name', 'person.nationalId', 'person.address'] },
  { id: 'app', name: '公司設立登記申請書', en: 'Application letter',
    fieldRoles: { 'person.name': 'applicant' },
    fields: ['company.name', 'company.address', 'company.capital', 'person.name', 'person.phone', 'app.date'] },
  { id: 't70126', name: '章程', en: 'Articles of incorporation',
    fieldRoles: { 'person.name': ['representative', 'director'] },
    fields: ['company.name', 'company.address', 'company.capital', 'company.items', 'person.name', 'app.date'] },
  { id: 't70130', name: '股東同意書', en: 'Shareholder consent',
    fieldRoles: { 'person.name': ['applicant', 'director'] },
    fields: ['company.name', 'person.name', 'app.date'] },
  { id: 't70132', name: '董事願任同意書', en: 'Director consent',
    fieldRoles: { 'person.name': 'director' },
    fields: ['company.name', 'person.name', 'app.date'] },
  { id: 't70124', name: '建物所有權人同意書', en: 'Building owner consent',
    fields: ['company.name', 'company.address', 'owner.name', 'app.date'] },
  { id: 't70135', name: '設立登記表', en: 'Registration form',
    fieldRoles: { 'person.name': ['representative', 'director'], 'person.nationalId': ['representative', 'director'] },
    fields: ['company.name', 'company.address', 'company.capital', 'company.items', 'person.name', 'person.nationalId', 'person.address', 'person.phone', 'app.date'] },
];

export const formFieldRole = (form, key) => {
  const roles = form.fieldRoles?.[key];
  return (Array.isArray(roles) ? roles[0] : roles) ?? (key.startsWith('person.') ? 'applicant' : null);
};
export const formFieldLabel = (form, key, role = formFieldRole(form, key)) => {
  const label = { applicant: '申請人', representative: '負責人', director: '董事' }[role];
  if (label && key === 'person.name') return `${label}姓名`;
  if (label && key === 'person.nationalId') return `${label}身分證字號`;
  return FIELDS[key].label;
};
export const formBindings = (form) => form.fields.flatMap((key) => {
  const roles = form.fieldRoles?.[key];
  return (Array.isArray(roles) ? roles : [formFieldRole(form, key)])
    .map((role) => ({ key, label: formFieldLabel(form, key, role), role }));
});

export const usedIn = (key) => FORMS.filter((f) => f.fields.includes(key)).length;
export const allFieldKeys = () => [...new Set(FORMS.flatMap((f) => f.fields))];
export const paperFieldCount = () => FORMS.reduce((n, f) => n + formBindings(f).length, 0);

// Taiwan national ID checksum
export function validNationalId(id) {
  if (!/^[A-Z][12]\d{8}$/.test(id || '')) return false;
  const L = 'ABCDEFGHJKLMNPQRSTUVXYWZIO';
  const n = L.indexOf(id[0]) + 10;
  const d = [Math.floor(n / 10), n % 10, ...id.slice(1).split('').map(Number)];
  const w = [1, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1];
  return d.reduce((s, x, i) => s + x * w[i], 0) % 10 === 0;
}

export function validate(key, value) {
  const t = FIELDS[key]?.type;
  if (value === undefined || value === null || String(value).trim() === '') return 'Required';
  if (t === 'nationalId' && !validNationalId(value)) return 'Invalid national ID checksum';
  if (t === 'money' && !/^\d+$/.test(String(value).replace(/,/g, ''))) return 'Numbers only';
  if (t === 'phone' && !/^[\d\-\s()+]{8,}$/.test(value)) return 'Invalid phone';
  return null;
}

export const rocDate = (iso) => {
  const d = new Date(iso);
  return `中華民國 ${d.getFullYear() - 1911} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};
export const money = (v) => Number(String(v).replace(/,/g, '')).toLocaleString('en-US');

// ---------- documents: one renderer for every form (server hashes it, browser previews it live) ----------
export const fmt = (k, v) => k === 'company.capital' ? `NT$ ${money(v)}` : k === 'app.date' ? rocDate(v) : k === 'company.name' ? `${v}有限公司` : v;
const SENTENCES = {
  app: (d) => `茲申請 ${d['company.name']}有限公司 設立登記，檢附相關文件，請 鑒核。`,
  t70126: (d) => `第一條 本公司依照公司法規定組織之，定名為 ${d['company.name']}有限公司。第二條 本公司所營事業如下：${d['company.items']}。第三條 本公司設於 ${d['company.address']}。第四條 本公司資本總額為新臺幣 ${d['company.capital$']} 元。`,
  t70130: (d) => `茲同意設立 ${d['company.name']}有限公司，訂定公司章程，並選任 ${d['person.name']} 為唯一董事。`,
  t70132: (d) => `本人同意擔任 ${d['company.name']}有限公司董事。　立同意書人：${d['person.name']}`,
  t70124: (d) => `本人（房屋所有權人 ${d['owner.name']}）所有座落於 ${d['company.address']} 之房屋，同意 ${d['company.name']}有限公司 登記為所在地。`,
};
// wrap(key, text) lets the browser highlight values; the server passes identity so hashes stay stable.
export function docBody(form, data, wrap = (_k, t) => t) {
  const d = new Proxy({}, { get: (_, k) => k === 'company.capital$' ? wrap('company.capital', money(data['company.capital'])) : wrap(k, data[k] ?? '') });
  const rows = formBindings(form).map(({ key, label }) => `<tr><th>${label}</th><td>${wrap(key, data[key] ? fmt(key, data[key]) : '')}</td></tr>`).join('');
  return `<h1>${form.name}</h1>${SENTENCES[form.id] ? `<p class="s">${SENTENCES[form.id](d)}</p>` : ''}<table>${rows}</table>`;
}
