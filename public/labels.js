const SOURCES = {
  Applicant: '申請人 · Applicant',
  'Agent draft': '代理草稿 · Agent draft',
  'MOI identity': '內政部身份 · MOI identity',
  'Verified by SMS': '簡訊驗證 · Verified by SMS',
  'Household registration': '戶籍資料 · Household registration',
  'Demo articles effective date': '展示章程日 · Demo articles date',
  'Demo scenario': '展示情境 · Demo scenario',
  System: '系統 · System',
};

export const sourceLabel = (source) => SOURCES[source] ?? source?.replace('Name reservation 預查 ', '名稱預查 · Name reservation ') ?? '—';

export const errorLabel = (message) => ({
  Required: '此欄必填 · Required',
  'Numbers only': '請輸入數字 · Numbers only',
  'Invalid phone': '電話格式有誤 · Invalid phone',
  'Invalid national ID checksum': '身分證字號有誤 · Invalid national ID',
}[message] ?? message);

export const verificationLabel = (check) => ({
  identity: '身份確認 · Identity', integrity: '完整性 · Integrity',
  consistency: '一致性 · Consistency', evidence: '佐證資料 · Evidence',
  records: '機關資料 · Gov records',
}[check.key] ?? check.label);

export const verificationDetail = (check) => {
  const meaning = {
    identity: ['簡訊已確認此版本', '身份確認未通過'],
    integrity: ['內容與簽章相符', '確認後內容有異動'],
    consistency: ['文件與確認資料相符', '文件內容不一致'],
    evidence: ['名稱預查有效', '名稱預查待核對'],
    records: ['戶籍資料相符', '戶籍資料待核對'],
  }[check.key];
  return meaning ? `${meaning[check.ok ? 0 : 1]} · ${check.detail}` : check.detail;
};

export const evidenceKind = (kind) => ({
  capital_verification: '資本查核 · Capital verification',
  address_approval: '地址核准 · Address approval',
  name_approval: '名稱核准 · Name approval',
}[kind] ?? kind);

export const evidenceField = (field) => ({
  demo_report_presence: '文件提供 · Report provided',
  report_presence: '文件提供 · Report provided',
  document_status: '核准狀態 · Approval status',
  'Company-Name': '公司名稱 · Company name',
  'Capital-TWD': '資本額 · Capital (TWD)',
  Address: '公司地址 · Registered address',
  'document.issued_on': '發文日期 · Issue date',
  'demo_rule: audit.certified_on = company.articles_date': '簽證日＝章程日 · Certification = articles date',
  'demo_rule: company.articles_date <= application.date': '章程日不晚於申請日 · Articles on/before application',
}[field] ?? field);

export const evidenceStatus = (status) => ({
  passed: '通過 · Passed', rejected: '駁回 · Rejected',
  needs_confirmation: '待確認 · Needs confirmation', missing: '缺件 · Missing',
  mismatch: '不符 · Mismatch',
  unknown: '未確認 · Unknown', unavailable: '無法核對 · Unavailable',
}[status] ?? status);
