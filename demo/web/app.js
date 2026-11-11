const kinds = {
  capital_verification: 'Accountant capital verification',
  address_approval: 'Address approval',
  name_approval: 'Company-name approval',
};
const outcomeLabels = { approve: 'Approved', request_documents: 'Documents requested', decline: 'Declined' };
const statusLabels = { passed: 'Passed', rejected: 'Rejected', needs_confirmation: 'Confirm', missing: 'Missing', mismatch: 'Mismatch' };
const fieldLabels = { attachment: 'Required document', generated_package: 'Core-generated package', document_status: 'Document outcome', 'Company-Name': 'Company name', 'Capital-TWD': 'Capital amount', Address: 'Registered address', 'Issued-On (demo scenario)': 'Issue date · demo rule' };
const byId = (id) => document.getElementById(id);
let currentCase;
let currentReview;
let busy = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function announce(message) { byId('activity').textContent = message; }
function showError(message) {
  byId('error').textContent = message;
  byId('error').hidden = !message;
}
function display(value, field) {
  if (value === null || value === undefined || value === '') return 'Not available';
  if (field === 'Capital-TWD' && Number.isFinite(Number(value))) return `TWD ${Number(value).toLocaleString('en-US')}`;
  return String(value).replaceAll('_', ' ');
}
function badgeClass(status) {
  return status === 'passed' ? 'badge-passed' : status === 'rejected' ? 'badge-declined' : 'badge-warning';
}
function humanError(error) {
  const code = error.message;
  const messages = {
    reason_required: 'Add a review note before requesting documents or declining.',
    unresolved_checks: 'Approval is blocked because evidence checks remain unresolved. Refresh and review the findings.',
    evidence_revision_changed: 'The evidence changed after this review was loaded. Findings have been refreshed; reconsider your decision before submitting again.',
    only_explicitly_marked_demo_documents_are_accepted: 'This file is not marked as demo evidence. Choose one of the sample PDFs.',
    document_type_mismatch: 'This PDF belongs to a different document category. Upload it in the matching section.',
    unreadable_pdf: 'The PDF could not be read. Try a readable demo PDF.',
    pdftotext_unavailable: 'PDF reading is unavailable on the demo service. Check the Poppler installation.',
    invalid_body_size: 'The upload exceeds the allowed size. Choose a PDF up to 10 MB.',
    expected_demo_pdf_and_supported_kind: 'Choose a valid PDF for this document category.',
  };
  return messages[code] || (error instanceof TypeError ? 'The demo service is unavailable. Start the local server, then refresh.' : `The request failed: ${code.replaceAll('_', ' ')}.`);
}
async function api(path, options) {
  const response = await fetch(path, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `Request returned ${response.status}`);
  return value;
}
function setBusy(value) {
  busy = value;
  byId('refresh').disabled = value;
  byId('generate').disabled = value;
  document.querySelectorAll('.upload input, .upload button').forEach((control) => { control.disabled = value; });
  document.querySelectorAll('[data-decision]').forEach((button) => {
    button.disabled = value || !currentReview || (button.dataset.decision === 'approve' && currentReview.recommendation !== 'approve');
  });
}
function sourceLink(source, label = 'View source PDF · page 1') {
  const link = element('a', 'source-link', label);
  link.href = source.url;
  link.target = '_blank';
  link.rel = 'noopener';
  return link;
}

for (const [kind, title] of Object.entries(kinds)) {
  const form = element('form', 'upload');
  const heading = element('div', 'upload-heading');
  const label = element('label', '', title);
  label.htmlFor = `file-${kind}`;
  heading.append(label);
  const controls = element('div', 'upload-controls');
  const input = element('input');
  input.type = 'file';
  input.accept = '.pdf,application/pdf';
  input.id = `file-${kind}`;
  input.required = true;
  input.setAttribute('aria-describedby', `upload-status-${kind}`);
  const button = element('button', 'button button-secondary', 'Upload PDF');
  button.type = 'submit';
  button.setAttribute('aria-label', `Upload ${title.toLowerCase()}`);
  controls.append(input, button);
  const status = element('p', 'upload-status', 'No document uploaded.');
  status.id = `upload-status-${kind}`;
  status.setAttribute('role', 'status');
  form.append(heading, controls, status);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !input.files.length) return;
    const file = input.files[0];
    if (file.size > 10 * 1024 * 1024) { showError('Choose a PDF up to 10 MB.'); return; }
    setBusy(true);
    showError('');
    status.textContent = 'Uploading and reading PDF…';
    button.textContent = 'Uploading…';
    try {
      await api(`/api/attachments?kind=${encodeURIComponent(kind)}`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file });
      input.value = '';
      await loadCase();
      announce(`${title} uploaded. Findings updated; any previous decision was cleared.`);
    } catch (error) {
      status.textContent = 'Upload failed. Previous evidence has been retained.';
      showError(humanError(error));
    } finally {
      button.textContent = 'Upload PDF';
      setBusy(false);
    }
  });
  byId('uploads').append(form);
}

function renderCase(data) {
  currentCase = data;
  const application = data.application;
  byId('company').textContent = application.company_name;
  byId('capital').textContent = `TWD ${Number(application.capital_twd).toLocaleString('en-US')}`;
  byId('address').textContent = application.address;
  byId('application-date').textContent = application.application_date;
  byId('evidence-count').textContent = `${data.attachments.length} of 3`;
  renderGeneration(data.generation);
  for (const kind of Object.keys(kinds)) {
    const status = byId(`upload-status-${kind}`);
    const attachment = data.attachments.find((item) => item.kind === kind);
    status.replaceChildren();
    if (attachment) {
      status.append(document.createTextNode('Uploaded · '), sourceLink(attachment, 'View PDF'));
    } else status.textContent = 'No document uploaded.';
  }
}

function renderGeneration(generation) {
  const list = byId('generated-documents');
  list.replaceChildren();
  list.hidden = !generation;
  byId('generation-status').textContent = generation
    ? `${generation.documents.length} PDFs generated and verified by the core. Preview or download below.`
    : 'Generate the core package before approving the review.';
  byId('generate').textContent = generation ? 'Generate new demo package' : 'Generate demo PDFs';
  if (!generation) return;
  for (const document of generation.documents) {
    const item = element('li');
    const title = element('span', '', document.name);
    const links = element('span', 'document-links');
    const preview = sourceLink({ url: document.preview_url }, 'Preview');
    const download = sourceLink({ url: document.download_url }, 'Download');
    download.download = document.name;
    links.append(preview, download);
    item.append(title, links);
    list.append(item);
  }
}

function renderReview(review) {
  currentReview = review;
  const outcomes = {
    approve: { title: 'Evidence is consistent', copy: 'All required demo checks pass. A reviewer can record approval for this evidence version.', badge: 'Ready to approve', tone: 'passed', icon: '✓' },
    request_documents: { title: 'More information is needed', copy: 'Missing, unclear, or conflicting evidence needs clarification before approval.', badge: 'Needs clarification', tone: 'warning', icon: '!' },
    decline: { title: 'Rejection found in the evidence', copy: 'A supporting document states a rejected outcome. Review its source and record your reason.', badge: 'Review rejection', tone: 'declined', icon: '!' },
  };
  const outcome = outcomes[review.recommendation];
  byId('recommendation').className = `recommendation is-${outcome.tone}`;
  byId('recommendation').querySelector('.recommendation-icon').textContent = outcome.icon;
  byId('recommendation-title').textContent = outcome.title;
  byId('recommendation-copy').textContent = outcome.copy;
  byId('recommendation-badge').className = `badge badge-${outcome.tone}`;
  byId('recommendation-badge').textContent = outcome.badge;
  byId('approve-hint').textContent = review.recommendation === 'approve'
    ? 'All required checks pass. Approval records a simulated decision for the current evidence.'
    : 'Approval is unavailable until all required evidence checks pass.';
  byId('checks').replaceChildren();
  const reviewKinds = { ...kinds, application: 'Generated application package' };
  for (const [kind, title] of Object.entries(reviewKinds)) {
    const checks = review.checks.filter((check) => check.kind === kind);
    if (!checks.length) continue;
    const allPassed = checks.length > 0 && checks.every((check) => check.status === 'passed');
    const group = element('details', 'check-group');
    group.open = !allPassed;
    const summary = element('summary', 'check-group-summary');
    summary.append(element('span', '', title), element('span', `badge ${allPassed ? 'badge-passed' : 'badge-warning'}`, allPassed ? `${checks.length} passed` : 'Review needed'));
    group.append(summary);
    for (const check of checks) {
      const row = element('div', 'check');
      const header = element('div', 'check-header');
      header.append(element('h3', '', fieldLabels[check.field] || check.field), element('span', `badge ${badgeClass(check.status)}`, statusLabels[check.status] || check.status));
      const comparison = element('dl', 'comparison');
      for (const [label, value] of [['Expected', check.expected], ['In document', check.actual]]) {
        const pair = element('div');
        pair.append(element('dt', '', label), element('dd', '', display(value, check.field)));
        comparison.append(pair);
      }
      row.append(header, comparison);
      if (check.field === 'Issued-On (demo scenario)') row.append(element('p', 'check-message', 'This fixed demo uses a common issue date. It is not a legal date requirement.'));
      if (check.source) row.append(sourceLink(check.source));
      group.append(row);
    }
    byId('checks').append(group);
  }
  const decision = review.decision;
  byId('decision-result').hidden = !decision;
  byId('decision-result').textContent = decision
    ? `Simulated decision: ${outcomeLabels[decision.decision]}. ${decision.reason || 'All required evidence checks passed.'} Uploading new evidence clears this decision.`
    : '';
  setBusy(busy);
}

async function loadCase() {
  const data = await api('/api/case');
  renderCase(data);
  renderReview({ ...data.review, decision: data.decision });
}
async function refresh() {
  if (busy) return;
  setBusy(true);
  showError('');
  byId('refresh').textContent = 'Refreshing…';
  try { await loadCase(); announce('Review refreshed.'); }
  catch (error) { currentReview = null; showError(humanError(error)); }
  finally { byId('refresh').textContent = 'Refresh review'; setBusy(false); }
}
byId('refresh').addEventListener('click', refresh);
byId('generate').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  showError('');
  byId('generate').textContent = 'Generating…';
  byId('generation-status').textContent = 'The native core is generating and verifying the PDF package. This can take up to two minutes.';
  try {
    await api('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await loadCase();
    announce('Core PDF package generated. Preview and download links are available.');
  } catch (error) {
    renderGeneration(currentCase?.generation);
    byId('generation-status').textContent = 'Generation failed. Any previous successful package is still available.';
    showError(humanError(error));
  } finally { setBusy(false); }
});
document.querySelectorAll('[data-decision]').forEach((button) => {
  button.addEventListener('click', async () => {
    const decision = button.dataset.decision;
    const reason = byId('reason').value.trim();
    if (decision !== 'approve' && !reason) {
      showError('Add a review note before requesting documents or declining.');
      byId('reason').focus();
      return;
    }
    setBusy(true);
    showError('');
    try {
      await api('/api/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, reason, evidence_revision: currentReview.evidence_revision }) });
      await loadCase();
      announce(`${outcomeLabels[decision]}: simulated decision recorded.`);
    } catch (error) {
      if (error.message === 'evidence_revision_changed') {
        try { await loadCase(); }
        catch { currentReview = null; }
      }
      showError(humanError(error));
    }
    finally { setBusy(false); }
  });
});

async function loadFixtures() {
  try {
    const { fixtures } = await api('/api/fixtures');
    if (!fixtures.length) return;
    const details = element('details', 'fixtures');
    details.append(element('summary', '', 'Download sample PDFs'));
    const list = element('ul');
    for (const fixture of fixtures) {
      const item = element('li');
      const link = element('a', '', fixture.name.replace(/\.pdf$/, '').replaceAll('-', ' ').replaceAll('_', ' '));
      link.href = fixture.url;
      link.download = fixture.name;
      item.append(link);
      list.append(item);
    }
    details.append(list);
    byId('uploads').after(details);
  } catch { /* Samples are optional; uploads and findings remain available. */ }
}
refresh();
loadFixtures();
