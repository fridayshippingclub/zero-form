import { t } from '/language.js';

const sources = () => ({
  Applicant: t('申請人', 'Applicant'),
  'Agent draft': t('代理草稿', 'Agent draft'),
  'MOI identity': t('展示身份資料', 'Demo identity profile'),
  'Verified by SMS': t('展示代碼確認', 'Demo code confirmation'),
  'Household registration': t('展示戶籍資料', 'Demo household records'),
  'Demo articles effective date': t('展示章程日', 'Demo articles date'),
  'Demo scenario': t('展示情境', 'Demo scenario'),
  System: t('系統', 'System'),
});

export const sourceLabel = (source) => sources()[source] ?? source?.replace('Name reservation 預查 ', t('展示名稱預查', 'Demo name reservation') + ' ') ?? '—';

export const errorLabel = (message) => ({
  Required: t('此欄必填', 'Required'),
  'Numbers only': t('請輸入數字', 'Numbers only'),
  'Invalid phone': t('電話格式有誤', 'Invalid phone'),
  'Invalid national ID checksum': t('身分證字號有誤', 'Invalid national ID'),
}[message] ?? message);

export const verificationLabel = (check) => ({
  identity: t('展示身份確認', 'Demo confirmation'), integrity: t('完整性', 'Integrity'),
  consistency: t('一致性', 'Consistency'), evidence: t('佐證資料', 'Evidence'),
  records: t('展示機關資料', 'Demo records'),
}[check.key] ?? check.label);

export const verificationDetail = (check) => {
  const meaning = {
    identity: ['簡訊已確認此版本', '身份確認未通過'],
    integrity: ['內容與簽章相符', '確認後內容有異動'],
    consistency: ['文件與確認資料相符', '文件內容不一致'],
    evidence: ['名稱預查有效', '名稱預查待核對'],
    records: ['戶籍資料相符', '戶籍資料待核對'],
  }[check.key];
  const demoDetail = { identity: check.ok ? 'Demo code confirmed this snapshot' : 'Demo confirmation does not match', evidence: check.ok ? 'Demo name reservation matches' : 'Demo name reservation differs', records: check.ok ? 'Demo household record matches' : 'No demo household match' }[check.key];
  return meaning ? t((demoDetail ? '展示：' : '') + meaning[check.ok ? 0 : 1], demoDetail ?? check.detail) : check.detail;
};

export const evidenceKind = (kind) => ({
  capital_verification: t('資本查核', 'Capital verification'),
  address_approval: t('地址核准', 'Address approval'),
  name_approval: t('名稱核准', 'Name approval'),
}[kind] ?? kind);

export const evidenceField = (field) => ({
  demo_report_presence: t('文件提供', 'Report provided'),
  report_presence: t('文件提供', 'Report provided'),
  document_status: t('核准狀態', 'Approval status'),
  'Company-Name': t('公司名稱', 'Company name'),
  'Capital-TWD': t('資本額', 'Capital (TWD)'),
  Address: t('公司地址', 'Registered address'),
  'document.issued_on': t('發文日期', 'Issue date'),
  'demo_rule: audit.certified_on = company.articles_date': t('簽證日＝章程日', 'Certification = articles date'),
  'demo_rule: company.articles_date <= application.date': t('章程日不晚於申請日', 'Articles on/before application'),
}[field] ?? field);

export const evidenceStatus = (status) => ({
  passed: t('通過', 'Passed'), rejected: t('駁回', 'Rejected'),
  needs_confirmation: t('待確認', 'Needs confirmation'), missing: t('缺件', 'Missing'),
  mismatch: t('不符', 'Mismatch'),
  unknown: t('未確認', 'Unknown'), unavailable: t('無法核對', 'Unavailable'),
}[status] ?? status);
