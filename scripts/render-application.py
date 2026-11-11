#!/usr/bin/env python3
"""Render confirmed frontend data through the native core; synthetic forms only."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / 'assets/teammate/NotoSansTC-Regular.ttf'

def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2))

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def run(args, env):
    result = subprocess.run(args, cwd=ROOT, env=env, capture_output=True, text=True, timeout=180)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or 'core_failed')
    return json.loads(result.stdout)

def render(source, destination):
    data = source['data']
    forms = source['forms']
    if not isinstance(forms,list) or not 1 <= len(forms) <= 16:
        raise ValueError('invalid_form_count')
    ids = [f['id'] for f in forms]
    if len(set(ids)) != len(ids) or any(not re.fullmatch(r'[A-Za-z0-9_-]+',i) for i in ids):
        raise ValueError('invalid_form_id')
    if destination.exists():
        raise ValueError('output_already_exists')
    destination.parent.mkdir(parents=True,exist_ok=True)
    executable = ROOT / 'target/debug/zero-form'
    if not executable.is_file():
        raise ValueError('core_not_built')
    env = os.environ.copy()
    for variable, binary in [('ZERO_FORM_TYPST','typst'),('ZERO_FORM_PDFTOPPM','pdftoppm'),('ZERO_FORM_PDFTOTEXT','pdftotext')]:
        chosen = env.get(variable) or (str(ROOT/'.tools/bin'/binary) if (ROOT/'.tools/bin'/binary).is_file() else shutil.which(binary))
        if not chosen:
            raise ValueError('missing_tool:'+binary)
        env[variable]=chosen
    pdfmetrics.registerFont(TTFont('DemoTC',str(FONT)))
    with tempfile.TemporaryDirectory(prefix='zero-form-dynamic-') as temporary:
        work=Path(temporary)
        shutil.copyfile(FONT,work/'font.ttf')
        fields={};facts=[];templates={};documents=[];properties={};fact_keys=set()
        roles={'applicant':'person-applicant','representative':'person-applicant','director':'person-applicant','company':'company-applicant','owner':'property-owner'}
        for form in forms:
            if not 1 <= len(form['fields']) <= 12:
                raise ValueError('invalid_field_count')
            path=work/(form['id']+'.pdf')
            c=canvas.Canvas(str(path),pagesize=(595.28,841.89),invariant=1)
            c.setTitle('DEMO ONLY - '+form['name'])
            c.setFont('Helvetica-Bold',12);c.drawString(40,807,'MOCK / DEMO ONLY / NOT VALID FOR FILING')
            c.setFont('DemoTC',16);c.drawString(40,775,form['name'])
            c.setFont('Helvetica',8);c.drawString(40,752,'Generated from confirmed application data. No signature or legal attestation.')
            purposes = {
                'app': '本示意文件彙整本次公司設立申請資料，供申請人核對並展示文件生成流程。',
                't70126': '第一條：公司名稱依下列資料。第二條：營業項目依下列資料。第三條：所在地依下列資料。第四條：資本總額依下列資料。本章程僅為展示。',
                't70130': '本示意文件展示唯一股東就設立公司及本人擔任唯一董事之確認資料。此文件不是已簽署的股東決議。',
                't70132': '本示意文件展示董事願任資料及對應公司。本文件未經本人簽署，不構成真實任職同意。',
                't70124': '本示意文件展示建物所有權人及擬登記公司所在地資料。未有真實所有權或使用權之認證。',
                't70135': '本示意登記表彙整公司基本資料，以及同一人作為負責人與唯一董事之資料，供展示跨文件一致性核對。',
            }
            c.setFont('DemoTC',9)
            for line_index, line in enumerate(textwrap.wrap(purposes.get(form['id'],'本文件僅供概念驗證展示。'),width=52)):
                c.drawString(42,722-line_index*15,line)
            targets={};bindings={}
            for i,field in enumerate(form['fields']):
                key=field['key']; value=data.get(key)
                if value is None or isinstance(value,(dict,list,bool)) or not str(value).strip():
                    raise ValueError('missing_or_invalid_field:'+key)
                value=str(value)
                role=field.get('role') or ('company' if key.startswith('company.') else 'owner' if key.startswith('owner.') else 'applicant')
                if role not in roles:raise ValueError('unknown_role:'+role)
                predicate=key.split('.',1)[-1] if key.startswith(('person.','company.','owner.')) else key
                semantic=role+'.'+predicate
                if semantic not in fields:
                    fields[semantic]={'role':role,'predicate':predicate,'require_verification_event':False}
                    properties[semantic]={'type':'string','minLength':1,'maxLength':500}
                fact_key=(roles[role],predicate)
                if fact_key not in fact_keys:
                    fact_keys.add(fact_key)
                    facts.append({'id':'fact-'+str(len(facts)+1),'subject':roles[role],'predicate':predicate,'value':value,
                        'revision':str(source['v']),'source':'confirmed-snapshot:'+source['hash']+':'+key,
                        'confirmation':'confirmed','verification_event':None,'valid_from':'2026-01-01','valid_to':None})
                target='field-'+str(i+1);y=180+i*45
                c.setFont('DemoTC',10);c.drawString(42,841.89-y+10,field['label'])
                c.setStrokeColorRGB(.75,.8,.82);c.rect(40,841.89-y-25,515,27,stroke=1,fill=0)
                display=value+'有限公司' if key=='company.name' and not value.endswith('有限公司') else value
                size=min(11,500/max(pdfmetrics.stringWidth(display,'DemoTC',1),1))
                if size<6:raise ValueError('field_too_long:'+key)
                targets[target]={'page':1,'rect':[42.0,float(y),510.0,22.0],'filled_by':'applicant','control':{'kind':'text','size':float(size)}}
                # Semantic values remain exactly those confirmed by the applicant.
                bindings[target]={'source':{'kind':'field','field':semantic},'transform':{'kind':'identity'}}
            c.setFont('Helvetica',8);c.drawString(40,35,'ZERO FORM / SYNTHETIC TEMPLATE / NO GOVERNMENT SUBMISSION / Page 1 of 1');c.save()
            templates[form['id']]={'version':'1','source':{'path':path.name,'sha256':digest(path)},
                'font':{'asset':{'path':'font.ttf','sha256':digest(work/'font.ttf')},'family':'Noto Sans TC'},'targets':targets}
            documents.append({'id':form['id'],'template':form['id'],'condition':{'op':'always'},'repeat_field':None,'bindings':bindings})
        definition={'schema_version':1,'application':{'id':'frontend-company-demo','version':'1.0.0','valid_from':'2026-01-01','valid_to':None,
            'schema':{'$schema':'https://json-schema.org/draft/2020-12/schema','type':'object','additionalProperties':False,'properties':properties,'required':list(fields)},
            'fields':fields,'rules':[],'documents':documents},'templates':templates}
        dump(work/'definition.json',definition)
        definition_hash=run([str(executable),'check-definition',str(work/'definition.json')],env)['definition_hash']
        request={'id':'application-v'+str(source['v']),'application_type':'frontend-company-demo','scope':'demo-frontend',
            'as_of':'2026-11-11','roles':roles}
        bundle={'scope':'demo-frontend','read_revision':source['hash'],'grant_id':'demo-confirmed-snapshot','expires_on':'2099-12-31',
            'allowed_fact_ids':[f['id'] for f in facts],'allowed_relationship_ids':[],'approved_definition_hashes':[definition_hash],'facts':facts,'relationships':[]}
        dump(work/'request.json',request);dump(work/'facts.json',bundle)
        run([str(executable),'run','--definition',str(work/'definition.json'),'--request',str(work/'request.json'),
            '--fixture-facts',str(work/'facts.json'),'--now','2026-11-11','--assets',str(work),'--out',str(destination)],env)
        manifest=json.loads((destination/'manifest.json').read_text())
        return {'mode':'demo_only','application_id':source['applicationId'],'frontend_snapshot_hash':source['hash'],
            'snapshot_hash':manifest['snapshot_hash'],'documents':{f['id']:{'path':str(destination/'documents'/(f['id']+'.pdf')),
                'sha256':digest(destination/'documents'/(f['id']+'.pdf'))} for f in forms}}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--input',required=True,type=Path);parser.add_argument('--out',required=True,type=Path)
    args=parser.parse_args()
    try:
        result=render(json.loads(args.input.read_text()),args.out.resolve())
        print(json.dumps(result,ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error':'core_render_failed','detail':str(error)},ensure_ascii=False),file=sys.stderr)
        sys.exit(1)

if __name__=='__main__':main()
