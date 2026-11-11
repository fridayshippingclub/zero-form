"""Demo-only evidence comparisons, not legal eligibility or identity verification."""
import re
import unicodedata
from datetime import date

KINDS = ('capital_verification', 'address_approval', 'name_approval')
APPLICATION = {'company_name': 'Harbor Labs', 'capital_twd': 10000,
               'address': '10 Example Street', 'application_date': '2026-11-11', 'articles_date': '2026-11-11'}
LABELS = ('Document-Type', 'Company-Name', 'Capital-TWD', 'Address', 'Status', 'Issued-On', 'Certified-On', 'Demo-Only')

def parse_document(text, kind):
    fields = {}
    for label in LABELS:
        values = re.findall(r'^\s*' + re.escape(label) + r':\s*([^\r\n]+)', text, re.M)
        if len(values) > 1:
            raise ValueError('ambiguous_document_field: ' + label)
        if values:
            fields[label] = values[0].strip()
    if kind == 'capital_verification' and '資本查核報告書' in text and '展示樣張' in text and '非正式簽證' in text:
        normalized = unicodedata.normalize('NFKC', text)
        for label, key in [('公司名稱', 'Company-Name'), ('資本額', 'Capital-TWD'), ('查核簽證日期', 'Certified-On')]:
            values = re.findall(r'^\s*' + label + r'\s*:\s*([^\r\n]+)', normalized, re.M)
            if len(values) != 1:
                raise ValueError('missing_or_ambiguous_visible_field: ' + label)
            value = values[0].strip()
            if key == 'Capital-TWD':
                amount = re.fullmatch(r'(?:新臺幣|新台幣|NT\$)?\s*([0-9][0-9,]*)\s*元?', value)
                if not amount:
                    raise ValueError('invalid_visible_capital_amount')
                value = str(int(amount[1].replace(',', '')))
            elif key == 'Certified-On':
                chinese_date = re.fullmatch(r'(民國)?\s*([0-9]{2,4})\s*年\s*([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*日', value)
                if chinese_date:
                    year = int(chinese_date[2]) + (1911 if chinese_date[1] else 0)
                    value = date(year, int(chinese_date[3]), int(chinese_date[4])).isoformat()
                else:
                    value = date.fromisoformat(value).isoformat()
            if key in fields and fields[key] != value:
                raise ValueError('visible_and_machine_fields_disagree: ' + label)
            fields[key] = value
        fields.setdefault('Document-Type', 'capital_verification')
        fields.setdefault('Demo-Only', 'true')
        # A supplied demonstration report does not assert a real audit or regulatory approval.
        fields.setdefault('Status', 'provided')
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
        provided_report = kind == 'capital_verification' and status == 'provided'
        add(kind, 'demo_report_presence' if provided_report else 'document_status', 'provided' if provided_report else 'approved', status,
            'passed' if status == 'approved' or provided_report else 'rejected' if status == 'rejected' else 'needs_confirmation', a)
        for label, expected in [('Company-Name', expected_application['company_name'])] + (
            [('Capital-TWD', expected_application['capital_twd'])] if kind == 'capital_verification' else
            [('Address', expected_application['address'])] if kind == 'address_approval' else []):
            actual = f.get(label)
            if label == 'Capital-TWD' and actual and re.fullmatch(r'[0-9]+', actual):
                actual = int(actual)
            add(kind, label, expected, actual, 'passed' if actual == expected else 'missing' if actual is None else 'mismatch', a)
        if kind == 'capital_verification':
            certified, articles = f.get('Certified-On'), expected_application.get('articles_date')
            application_date = expected_application.get('application_date')
            def valid_date(value):
                try:
                    return isinstance(value, str) and bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', value)) and bool(date.fromisoformat(value))
                except ValueError:
                    return False
            valid = valid_date(certified) and valid_date(articles)
            add(kind, 'demo_rule: audit.certified_on = company.articles_date', articles, certified,
                'passed' if valid and certified == articles else 'mismatch' if valid else 'needs_confirmation', a)
            ordered = valid_date(articles) and valid_date(application_date) and articles <= application_date
            add(kind, 'demo_rule: company.articles_date <= application.date',
                {'on_or_before': application_date}, articles, 'passed' if ordered else 'needs_confirmation', a)
        if kind != 'capital_verification' or 'Issued-On' in f:
            actual = f.get('Issued-On')
            try:
                valid = isinstance(actual, str) and bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', actual)) and bool(date.fromisoformat(actual))
            except ValueError:
                valid = False
            add(kind, 'document.issued_on', 'valid issue date', actual, 'passed' if valid else 'needs_confirmation', a)
    recommendation = 'decline' if any(c['status'] == 'rejected' for c in checks) else (
        'approve' if all(c['status'] == 'passed' for c in checks) else 'request_documents')
    return {'mode': 'demo_only', 'evidence_revision': revision, 'recommendation': recommendation,
            'checks': checks, 'notice': 'Simulated review only. No identity verification or government submission.'}
