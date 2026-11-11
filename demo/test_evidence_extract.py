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

    def test_trusted_system_and_untrusted_json_are_separate_without_tools(self):
        spans=inventory(VARIANTS/'prose-roc.pdf');captured=[]
        semantic_observations(spans,'capital_verification',lambda body:(captured.append(body) or response([])))
        body=captured[0]
        self.assertIn('no tools',body['system'])
        self.assertNotIn(spans[0]['text'],body['system'])
        self.assertEqual(json.loads(body['messages'][0]['content'])['spans'],spans)
        self.assertNotIn('tools',body)
        self.assertNotIn('tool_choice',body)

    def test_kind_fields_extra_keys_and_fabricated_sources_are_rejected(self):
        spans=inventory(VARIANTS/'prose-roc.pdf')
        for entry in [
            {'field':'Address','raw_value':'sample','span_ids':[spans[0]['id']]},
            {'field':'Company-Name','raw_value':'sample','span_ids':[spans[0]['id']],'bbox':[0,0,10,10]},
        ]:
            with self.assertRaises(ValueError):semantic_observations(spans,'capital_verification',lambda body:response([entry]))
        result=semantic_observations(spans,'capital_verification',lambda body:response([
            {'field':'Company-Name','raw_value':'sample','span_ids':['missing-span']}]))
        self.assertIsNone(result['Company-Name']['value'])

    def test_duplicate_mapping_and_source_ids_are_unknown(self):
        spans=inventory(VARIANTS/'prose-roc.pdf');span=next(s for s in spans if '大大科技' in s['text'])
        entry={'field':'Company-Name','raw_value':'大大科技','span_ids':[span['id']]}
        result=semantic_observations(spans,'capital_verification',lambda body:response([entry,entry]))
        self.assertIsNone(result['Company-Name']['value'])
        entry={**entry,'span_ids':[span['id'],span['id']]}
        result=semantic_observations(spans,'capital_verification',lambda body:response([entry]))
        self.assertIsNone(result['Company-Name']['value'])

    def test_model_cannot_override_fixed_value_or_resolve_repeated_label(self):
        base={'page':1,'bbox':[10,10,100,12]}
        spans=[{**base,'id':'s1','text':'Company-Name: Sample One'},
               {**base,'id':'s2','text':'Reference: Sample Two'}]
        transport=lambda body:response([{'field':'Company-Name','raw_value':'Sample Two','span_ids':['s2']}])
        path=ROOT/'bench/review/capital-audit-report.pdf'
        with patch('evidence_extract.inventory',return_value=spans):
            self.assertEqual(extract_document(path,'capital_verification',transport)['fields']['Company-Name'],'Sample One')
        spans[1]['text']='Company-Name: Sample Two'
        with patch('evidence_extract.inventory',return_value=spans):
            result=extract_document(path,'capital_verification',transport)
            self.assertNotIn('Company-Name',result['fields'])
            self.assertEqual(next(o for o in result['observations'] if o['field']=='Company-Name')['reason'],'ambiguous_repeated_label')

    def test_explanation_only_receives_minimal_typed_summary(self):
        captured=[]
        def transport(body):
            captured.append(body)
            return {'stop_reason':'end_turn','content':[{'type':'text','text':json.dumps({'text':'The amount differs; request clarification.'})}]}
        result=explain_review({'recommendation':'request_documents','private_name':'Unrelated Person',
            'checks':[{'field':'Capital-TWD','expected':10000,'actual':12000,'status':'mismatch','source':{'quote':'Unrelated quotation','url':'https://example.invalid/private','path':'/private/example'}},
                      {'field':'Company-Name','expected':'Sample One','actual':'Sample Two','status':'mismatch'}]},transport)
        self.assertTrue(result['available']);self.assertEqual(result['authority'],'explanation_only')
        sent=json.loads(captured[0]['messages'][0]['content'])
        self.assertEqual(sent['checks'][0],{'field':'Capital-TWD','status':'mismatch','expected':10000,'actual':12000})
        self.assertEqual(sent['checks'][1],{'field':'Company-Name','status':'mismatch'})
        self.assertNotIn('Unrelated',json.dumps(captured));self.assertNotIn('example.invalid',json.dumps(captured))
        self.assertNotIn('tools',captured[0])

    def test_malformed_explanation_and_duplicate_json_fail_closed(self):
        payload={'recommendation':'unknown','checks':[]}
        for raw in ['{"text":42}', '{"text":"first","text":"second"}', '{"text":"fine","decision":"approve"}']:
            result=explain_review(payload,lambda body:{'stop_reason':'end_turn','content':[{'type':'text','text':raw}]})
            self.assertFalse(result['available']);self.assertIsNone(result['text'])

    def test_known_provider_reasoning_blocks_are_ignored(self):
        def transport(body):
            return {'stop_reason':'end_turn','content':[
                {'type':'thinking','thinking':'Internal sample reasoning','signature':'sample'},
                {'type':'redacted_thinking','data':'sample-provider-data'},
                {'type':'text','text':'{"text":"The supplied check is unknown."}'}]}
        result=explain_review({'recommendation':'unknown','checks':[]},transport)
        self.assertTrue(result['available'])
        self.assertNotIn('Internal',json.dumps(result))
        self.assertNotIn('sample-provider-data',json.dumps(result))
        for kind in ('tool_use','server_tool_use','unrecognized'):
            result=explain_review({'recommendation':'unknown','checks':[]},lambda body:{'stop_reason':'end_turn','content':[{'type':kind},{'type':'text','text':'{"text":"Sample"}'}]})
            self.assertFalse(result['available'])

    def test_capital_requires_whole_numeric_token_and_magnitude(self):
        for printed,raw in [('TWD 100000','10000'),('TWD 10,000','10'),
                            ('TWD 1.5 萬元','1'),('TWD 1 萬元','1'),
                            ('TWD 10000 萬元','10000'),('TWD -10000','10000')]:
            spans=[{'id':'s1','page':1,'bbox':[10,10,100,12],'text':printed}]
            result=semantic_observations(spans,'capital_verification',lambda body:response([
                {'field':'Capital-TWD','raw_value':raw,'span_ids':['s1']}]))
            self.assertIsNone(result['Capital-TWD']['value'],(printed,raw))
        for printed,raw,expected in [('TWD 10,000 元','10,000',10000),
                                     ('TWD 1 萬元','1 萬元',10000),
                                     ('已收足股款（TWD） 1 萬元','1 萬元',10000),
                                     ('實收資本 NTD 10000','NTD 10000',10000)]:
            spans=[{'id':'s1','page':1,'bbox':[10,10,100,12],'text':printed}]
            result=semantic_observations(spans,'capital_verification',lambda body:response([
                {'field':'Capital-TWD','raw_value':raw,'span_ids':['s1']}]))
            self.assertEqual(result['Capital-TWD']['value'],expected)

if __name__=='__main__':unittest.main()
