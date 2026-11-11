"""Demo-only evidence comparisons, not legal eligibility or identity verification."""
import re
from datetime import date

KINDS = ('capital_verification', 'address_approval', 'name_approval')
APPLICATION = {'company_name': 'Harbor Labs', 'capital_twd': 10000,
               'address': '10 Example Street', 'application_date': '2026-11-11'}
LABELS = ('Document-Type', 'Company-Name', 'Capital-TWD', 'Address', 'Status', 'Issued-On', 'Certified-On', 'Demo-Only')

def parse_document(text, kind):
    fields = {}
    for label in LABELS:
        values = re.findall(r'^\s*' + re.escape(label) + r':\s*([^\r\n]+)', text, re.M)
        if len(values) > 1:
            raise ValueError('ambiguous_document_field: ' + label)
        if values:
            fields[label] = values[0].strip()
    if fields.get('Demo-Only', '').lower() != 'true':
        raise ValueError('only_explicitly_marked_demo_documents_are_accepted')
    if fields.get('Document-Type') != kind:
        raise ValueError('document_type_mismatch')
    return fields

def assess(attachments, revision, application=None):
    expected_application = application or APPLICATION
    checks = []
    def add(kind, field, expected, actual, status, attachment=None):
        checks.append({'kind': kind, 'field': field, 'expected': expected, 'actual': actual,
                       'status': status, 'source': {'attachment_id': attachment['id'], 'page': 1,
                       'url': '/api/attachments/' + attachment['id']} if attachment else None})
    if application is None:
        add('application', 'generated_package', 'ready', None, 'missing')
    for kind in KINDS:
        a = attachments.get(kind)
        if not a:
            add(kind, 'attachment', 'required', None, 'missing')
            continue
        f = a['fields']
        status = f.get('Status')
        add(kind, 'document_status', 'approved', status,
            'passed' if status == 'approved' else 'rejected' if status == 'rejected' else 'needs_confirmation', a)
        for label, expected in [('Company-Name', expected_application['company_name'])] + (
            [('Capital-TWD', expected_application['capital_twd'])] if kind == 'capital_verification' else
            [('Address', expected_application['address'])] if kind == 'address_approval' else []):
            actual = f.get(label)
            if label == 'Capital-TWD' and actual and re.fullmatch(r'[0-9]+', actual):
                actual = int(actual)
            add(kind, label, expected, actual, 'passed' if actual == expected else 'missing' if actual is None else 'mismatch', a)
        dates = [('Certified-On', 'audit.certified_on', 'valid certification date')] if kind == 'capital_verification' and 'Certified-On' in f else []
        if 'Issued-On' in f or not dates:
            dates.append(('Issued-On', 'document.issued_on', 'valid issue date'))
        for label, semantic_field, expected in dates:
            actual = f.get(label)
            try:
                valid = isinstance(actual, str) and bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', actual)) and bool(date.fromisoformat(actual))
            except ValueError:
                valid = False
            add(kind, semantic_field, expected, actual, 'passed' if valid else 'needs_confirmation', a)
    recommendation = 'decline' if any(c['status'] == 'rejected' for c in checks) else (
        'approve' if all(c['status'] == 'passed' for c in checks) else 'request_documents')
    return {'mode': 'demo_only', 'evidence_revision': revision, 'recommendation': recommendation,
            'checks': checks, 'notice': 'Simulated review only. No identity verification or government submission.'}
