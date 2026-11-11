import io
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
import subprocess
import os
import urllib.request
import urllib.error
from reportlab.pdfgen.canvas import Canvas
from server import make_server
from review import KINDS, APPLICATION


def pdf(kind, capital=10000, status='approved', demo='true'):
    buffer = io.BytesIO()
    c = Canvas(buffer)
    lines = ['MOCK - DEMO ONLY - NOT VALID FOR FILING', 'Document-Type: ' + kind,
             'Company-Name: Harbor Labs', 'Capital-TWD: ' + str(capital),
             'Address: 10 Example Street', 'Status: ' + status,
             'Issued-On: 2026-11-11', 'Demo-Only: ' + demo]
    for i, line in enumerate(lines):
        c.drawString(40, 780-i*24, line)
    c.save()
    return buffer.getvalue()

class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.server = make_server(port=0)
        # Review-only cases inject an already generated application; integration below exercises the core.
        self.server.demo_state.application = dict(APPLICATION)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = 'http://127.0.0.1:' + str(self.server.server_port)
    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.server.demo_state.close()
        self.thread.join()
    def request(self, path, payload=None, content_type='application/json', headers=None):
        req = urllib.request.Request(self.base+path, data=payload,
            headers={'Content-Type':content_type, **(headers or {})})
        try:
            response = urllib.request.urlopen(req)
        except urllib.error.HTTPError as error:
            response = error
        return response.status, json.loads(response.read())
    def upload(self, kind, **kwargs):
        return self.request('/api/attachments?kind='+kind, pdf(kind, **kwargs), 'application/pdf')
    def decide(self, decision, reason=''):
        return self.request('/api/decision',json.dumps({'decision':decision,'reason':reason,'evidence_revision':self.server.demo_state.revision}).encode())
    def test_complete_upload_review_approve_and_invalidation(self):
        self.assertEqual(self.request('/api/review')[1]['recommendation'], 'request_documents')
        self.assertEqual(self.decide('approve')[0],409)
        for kind in KINDS:
            code, result = self.upload(kind)
            self.assertEqual(code,201)
            source = result['attachment']
            self.assertTrue(source['sha256'])
            with urllib.request.urlopen(self.base+source['url']) as response:
                self.assertTrue(response.read().startswith(b'%PDF-'))
        self.assertEqual(self.request('/api/review')[1]['recommendation'],'approve')
        code, decision = self.decide('approve')
        self.assertEqual(code,200)
        self.assertEqual(decision['evidence_revision'],3)
        self.upload('capital_verification',capital=12000)
        case = self.request('/api/case')[1]
        self.assertIsNone(case['decision'])
        self.assertEqual(case['review']['recommendation'],'request_documents')
        mismatch = next(c for c in case['review']['checks'] if c['status']=='mismatch')
        self.assertEqual((mismatch['expected'],mismatch['actual']),(10000,12000))
        self.assertEqual(mismatch['source']['page'],1)
        self.assertEqual(self.decide('approve')[0],409)
    def test_explicit_rejection_and_reason(self):
        self.upload('name_approval',status='rejected')
        self.assertEqual(self.request('/api/review')[1]['recommendation'],'decline')
        self.assertEqual(self.decide('decline')[0],400)
        self.assertEqual(self.decide('decline','Name was rejected in demo evidence')[0],200)
        self.assertEqual(self.decide('request_documents','Please upload revised evidence')[0],200)
    def test_non_demo_bad_pdf_and_wrong_kind(self):
        self.assertEqual(self.upload('capital_verification',demo='false')[0],422)
        self.assertEqual(self.request('/api/attachments?kind=name_approval',b'%PDF-invalid','application/pdf')[0],422)
        self.assertEqual(self.request('/api/attachments?kind=unknown',pdf('name_approval'),'application/pdf')[0],400)
        self.assertEqual(self.request('/api/attachments?kind=name_approval',pdf('capital_verification'),'application/pdf')[0],422)
        self.assertEqual(self.request('/api/case')[1]['evidence_revision'],0)
    def test_size_and_origin_guards(self):
        self.assertEqual(self.request('/api/attachments?kind=name_approval',b'x','application/pdf',{'Content-Length':str(11*1024*1024)})[0],413)
        self.assertEqual(self.request('/api/decision',b'{}',headers={'Origin':'https://other.example'})[0],403)
    def test_unknown_fields_never_pass(self):
        self.upload('name_approval',status='unknown')
        self.assertEqual(self.request('/api/review')[1]['recommendation'],'request_documents')
        self.assertEqual(self.decide('approve')[0],409)

    def test_stale_decision_cannot_apply_to_replaced_evidence(self):
        for kind in KINDS:
            self.upload(kind)
        old_revision = self.request('/api/review')[1]['evidence_revision']
        self.upload('name_approval')
        for decision in ('approve', 'request_documents', 'decline'):
            code, body = self.request('/api/decision',json.dumps({'decision':decision,
                'reason':'based on old view','evidence_revision':old_revision}).encode())
            self.assertEqual(code,409)
            self.assertEqual(body['error'],'evidence_revision_changed')
        self.assertIsNone(self.server.demo_state.decision)
        self.assertEqual(self.decide('approve')[0],200)

    def test_generation_guards_errors_and_busy(self):
        self.server.demo_state.application = None
        self.assertEqual(self.decide('approve')[0],409)
        self.assertEqual(self.request('/api/generations/unknown')[0],404)
        self.assertEqual(self.request('/api/generate',b'{"path":"/tmp"}')[0],400)
        self.server.demo_state.generation_lock.acquire()
        try:
            self.assertEqual(self.request('/api/generate',b'{}')[0],409)
        finally:
            self.server.demo_state.generation_lock.release()
        with patch('server.generate_package', side_effect=subprocess.TimeoutExpired('core',120)):
            self.assertEqual(self.request('/api/generate',b'{}')[0],504)
        with patch('server.generate_package', side_effect=RuntimeError('core_not_built')):
            self.assertEqual(self.request('/api/generate',b'{}')[0],503)
        with patch('server.generate_package', side_effect=ValueError('bad output')):
            self.assertEqual(self.request('/api/generate',b'{}')[0],422)
        self.assertIsNone(self.server.demo_state.generation)

    @unittest.skipUnless(os.environ.get('ZERO_FORM_GENERATION_TEST') == '1', 'Set ZERO_FORM_GENERATION_TEST=1 for native renderer integration')
    def test_actual_core_generation_preview_and_review_binding(self):
        self.server.demo_state.application = None
        code, generated = self.request('/api/generate',b'{}')
        self.assertEqual(code,201,generated)
        self.assertEqual(len(generated['documents']),5)
        self.assertEqual(generated['application']['capital_twd'],10000)
        self.assertTrue(generated['snapshot_hash'])
        self.assertEqual(self.request('/api/generations/'+generated['id'])[1],generated)
        document = generated['documents'][0]
        for key, disposition in [('preview_url','inline'),('download_url','attachment')]:
            with urllib.request.urlopen(self.base+document[key]) as response:
                self.assertTrue(response.read().startswith(b'%PDF-'))
                self.assertTrue(response.headers['Content-Disposition'].startswith(disposition))
        self.assertEqual(self.request('/api/generations/'+generated['id']+'/documents/not-listed.pdf')[0],404)
        self.assertEqual(self.request('/api/generations/'+generated['id']+'/documents/../../application.snapshot.json')[0],404)
        for kind in KINDS:
            self.upload(kind)
        self.assertEqual(self.decide('approve')[0],200)
        self.assertEqual(self.request('/api/case')[1]['generation']['id'],generated['id'])

if __name__ == '__main__':
    unittest.main()
