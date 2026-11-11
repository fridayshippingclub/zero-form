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
    fieldRoles: { 'person.name': 'representative' },
    fields: ['company.name', 'company.address', 'company.capital', 'company.items', 'person.name', 'app.date'] },
  { id: 't70130', name: '股東同意書', en: 'Shareholder consent',
    fieldRoles: { 'person.name': 'applicant' },
    fields: ['company.name', 'person.name', 'app.date'] },
  { id: 't70132', name: '董事願任同意書', en: 'Director consent',
    fieldRoles: { 'person.name': 'director' },
    fields: ['company.name', 'person.name', 'app.date'] },
  { id: 't70124', name: '建物所有權人同意書', en: 'Building owner consent',
    fields: ['company.name', 'company.address', 'owner.name', 'app.date'] },
  { id: 't70135', name: '設立登記表', en: 'Registration form',
    fieldRoles: { 'person.name': 'representative', 'person.nationalId': 'representative' },
    fields: ['company.name', 'company.address', 'company.capital', 'company.items', 'person.name', 'person.nationalId', 'person.address', 'person.phone', 'app.date'] },
];

export const formFieldRole = (form, key) => form.fieldRoles?.[key] ?? (key.startsWith('person.') ? 'applicant' : null);
export const formFieldLabel = (form, key) => {
  const role = formFieldRole(form, key);
  const label = { applicant: '申請人', representative: '負責人', director: '董事' }[role];
  if (label && key === 'person.name') return `${label}姓名`;
  if (label && key === 'person.nationalId') return `${label}身分證字號`;
  return FIELDS[key].label;
};

export const usedIn = (key) => FORMS.filter((f) => f.fields.includes(key)).length;
export const allFieldKeys = () => [...new Set(FORMS.flatMap((f) => f.fields))];
export const paperFieldCount = () => FORMS.reduce((n, f) => n + f.fields.length, 0);

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
