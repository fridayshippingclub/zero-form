"""Offline contract tests; stubbed transport is not evidence of live LLM accuracy."""
import hashlib
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
from evidence_extract import extract_document, inventory, semantic_observations, explain_review, normalized

ROOT=Path(__file__).resolve().parents[1]
VARIANTS=ROOT/'bench/review/accountant-variants'


def response(observations):
    return {'stop_reason':'end_turn','content':[{'type':'text','text':json.dumps({'observations':observations})}]}


class EvidenceTests(unittest.TestCase):
    def test_fixed_capital_preserves_original_and_uses_certified_date(self):
        path=ROOT/'bench/review/capital-audit-report.pdf';before=path.read_bytes()
        with patch.dict(os.environ,{'ZERO_FORM_ENABLE_LLM':'0'}):result=extract_document(path,'capital_verification')
        self.assertEqual(result['fields']['Capital-TWD'],'10000')
        self.assertEqual(result['fields']['Certified-On'],'2026-11-11')
        self.assertNotIn('Status',result['fields'])
        self.assertEqual(result['source_sha256'],hashlib.sha256(before).hexdigest())
        self.assertEqual(path.read_bytes(),before)
        self.assertTrue(all(o['source']['bbox'] for o in result['observations'] if o['value'] is not None))

    def test_fixed_address_and_name(self):
        for filename,kind in [('address-approved.pdf','address_approval'),('name-rejected.pdf','name_approval')]:
            with patch.dict(os.environ,{'ZERO_FORM_ENABLE_LLM':'0'}):result=extract_document(ROOT/'bench/review'/filename,kind)
            self.assertEqual(result['status'],'complete')
            self.assertEqual(result['fields']['Company-Name'],'Harbor Labs')

    def test_no_live_opt_in_leaves_varied_fields_unknown(self):
        with patch.dict(os.environ,{'ZERO_FORM_ENABLE_LLM':'0','ANTHROPIC_API_KEY':'unused-placeholder'}):
            result=extract_document(VARIANTS/'prose-roc.pdf','capital_verification')
            self.assertFalse(result['llm']['available'])
            self.assertNotIn('Capital-TWD',result['fields'])
            self.assertFalse(explain_review({'recommendation':'request_documents'})['available'])

    def test_three_layouts_and_mismatch_using_stub_selected_actual_spans(self):
        for filename,amount,date_raw in [('prose-roc.pdf','10,000','民國 115 年 11 月 11 日'),
                ('prose-mismatch.pdf','12,000','民國 115 年 11 月 11 日'),
                ('table-units.pdf','1 萬元','2026/11/11'),('two-page-letter.pdf','10000','2026-11-11')]:
            path=VARIANTS/filename;spans=inventory(path)
            company=next(s for s in spans if '大大科技' in s['text'])
            money=next(s for s in spans if amount in s['text'])
            cert=next(s for s in spans if date_raw in s['text'] and '申請' not in s['text'] and '章程' not in s['text'])
            capital_ids=[money['id']]
            if filename=='table-units.pdf':
                currency=next(s for s in spans if 'TWD' in s['text'])
                if currency['id'] not in capital_ids:capital_ids.insert(0,currency['id'])
            entries=[{'field':'Company-Name','raw_value':'大大科技','span_ids':[company['id']]},
                     {'field':'Capital-TWD','raw_value':amount,'span_ids':capital_ids},
                     {'field':'Certified-On','raw_value':date_raw,'span_ids':[cert['id']]}]
            result=extract_document(path,'capital_verification',transport=lambda body:response(entries))
            self.assertEqual(result['fields']['Capital-TWD'],'12000' if 'mismatch' in filename else '10000')
            self.assertEqual(result['fields']['Certified-On'],'2026-11-11')
            if filename=='two-page-letter.pdf':self.assertEqual(result['observations'][0]['page'],2)
            self.assertEqual(result['mode'],'llm')

    def test_ungrounded_model_text_is_unknown(self):
        spans=inventory(VARIANTS/'prose-roc.pdf')
        result=semantic_observations(spans,'capital_verification',lambda body:response([
            {'field':'Capital-TWD','raw_value':'999999999','span_ids':[spans[0]['id']]}]))
        self.assertIsNone(result['Capital-TWD']['value'])
        self.assertEqual(result['Capital-TWD']['reason'],'ungrounded_model_value')

    def test_currency_and_date_not_inferred(self):
        self.assertIsNone(normalized('Capital-TWD','10000',''))
        self.assertIsNone(normalized('Certified-On','115/11/11'))
        self.assertEqual(normalized('Certified-On','民國115年11月11日'),'2026-11-11')

if __name__=='__main__':unittest.main()
