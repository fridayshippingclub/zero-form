#!/usr/bin/env python3
"""Render confirmed frontend data through the native core; official-source backgrounds with marked demo overlays."""
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
import io
from pypdf import PdfReader, PdfWriter
from pdf_fonts import subset_font, SUBSET_FAMILY
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / 'assets/fonts/tw-kai/TW-Kai.ttf'

def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2))

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def run(args, env):
    result = subprocess.run(args, cwd=ROOT, env=env, capture_output=True, text=True, timeout=180)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or 'core_failed')
    return json.loads(result.stdout)


OFFICIAL_IDS = {'app': 't70433', **{key:key for key in ('t70126','t70130','t70132','t70124','t70135')}}
# Coordinates refer to the downloaded GCIS originals (top-left, PDF points).
# Only existing blank regions are populated. Unsupported facts get an appendix,
# preserving original statutory notes and leaving signatures/seals unfilled.
OFFICIAL_SLOTS = {
    'app': {'company.name': (1,218,201,130,18), 'company.address': (1,241,271,150,25)},
    't70126': {'company.name': (1,318,184,28,10), 'company.capital': (1,259,345,32,10),
               'company.items': (1,163,231,300,12)},
    't70130': {'company.name': (1,244,91,85,12), 'person.name:applicant': (1,89,396,174,12)},
    't70132': {'company.name': (1,247,150,112,24), 'person.name:director': (1,341,262,150,24)},
    't70124': {},
    't70135': {'company.name': (1,196,210,290,19), 'company.address': (1,240,273,300,15),
               'company.capital': (1,240,294,235,17), 'person.name:representative': (1,346,314,65,17),
               'person.phone': (1,400,137,138,16)},
}

def official_background(form, output, snapshot_hash):
    source = ROOT / 'assets/official' / (OFFICIAL_IDS[form['id']] + '.pdf')
    reader = PdfReader(source)
    writer = PdfWriter()
    placements = {}
    extra = []
    for i, field in enumerate(form['fields']):
        role_key = field['key'] + ':' + str(field.get('role'))
        rect = OFFICIAL_SLOTS[form['id']].get(role_key) or OFFICIAL_SLOTS[form['id']].get(field['key'])
        if rect: placements[i] = rect
        else: extra.append((i, field))
    for index, page in enumerate(reader.pages):
        width, height = float(page.mediabox.width), float(page.mediabox.height)
        buffer = io.BytesIO()
        mark = canvas.Canvas(buffer, pagesize=(width, height), invariant=1)
        mark.setFont('DemoKai', 8)
        mark.drawCentredString(width/2, 13, '展示樣張・未簽署・不得送件 | GCIS ' + OFFICIAL_IDS[form['id']])
        mark.setFont('Courier', 6); mark.drawCentredString(width/2, 5, 'snapshot sha256:' + snapshot_hash)
        mark.save(); buffer.seek(0)
        page = writer.add_page(page)  # attach first: pypdf>=7 only merges pages owned by a writer
        page.merge_page(PdfReader(buffer).pages[0])
        if '/Annots' in page and not page['/Annots']: del page['/Annots']
    if extra:
        buffer = io.BytesIO(); c = canvas.Canvas(buffer, pagesize=(595.32,841.92), invariant=1)
        c.setFont('DemoKai',18);c.drawCentredString(297.66,789,form['name'] + ' — 已確認資料附頁')
        c.setFont('DemoKai',10)
        c.drawString(42,757,'原始官方表單與備註完整保留；本頁列出未對應至原表空白位置的資料。')
        c.drawString(42,738,'本頁不是官方書表。簽名、印章、尚未蒐集的法定欄位均未代填。')
        for row,(index,field) in enumerate(extra):
            y=137+row*46
            c.setFont('DemoKai',10);c.drawString(43,841.92-y+12,field['label'])
            c.setStrokeColorRGB(.6,.6,.6);c.line(42,841.92-y-26,553,841.92-y-26)
            placements[index]=(len(reader.pages)+1,43,y,505,23)
        c.setFont('DemoKai',8);c.drawCentredString(297.66,25,'展示樣張・未簽署・不得送件 | 語意資料附頁')
        c.setFont('Courier',6);c.drawCentredString(297.66,16,'snapshot sha256:'+snapshot_hash)
        c.save();buffer.seek(0);writer.add_page(PdfReader(buffer).pages[0])
    with output.open('wb') as stream:writer.write(stream)
    return placements

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
    # Prefer the optimized build (~10x faster PDF verification); same code, same outputs. ZERO_FORM_BIN overrides.
    executable = Path(os.environ['ZERO_FORM_BIN']) if os.environ.get('ZERO_FORM_BIN') else next((ROOT/p for p in ('target/release/zero-form','target/debug/zero-form') if (ROOT/p).is_file()), ROOT/'target/debug/zero-form')
    if not executable.is_file():
        raise ValueError('core_not_built')
    env = os.environ.copy()
    for variable, binary in [('ZERO_FORM_TYPST','typst'),('ZERO_FORM_PDFTOPPM','pdftoppm'),('ZERO_FORM_PDFTOTEXT','pdftotext')]:
        chosen = env.get(variable) or (str(ROOT/'.tools/bin'/binary) if (ROOT/'.tools/bin'/binary).is_file() else shutil.which(binary))
        if not chosen:
            raise ValueError('missing_tool:'+binary)
        env[variable]=chosen
    pdfmetrics.registerFont(TTFont('DemoKai',str(FONT)))
    with tempfile.TemporaryDirectory(prefix='zero-form-dynamic-') as temporary:
        work=Path(temporary)
        subset_font(work/'font.ttf', ''.join(str(value) for value in data.values()))
        roles={'applicant':'person-applicant','representative':'person-applicant','director':'person-applicant','company':'company-applicant','owner':'property-owner'}
        # Each form is an independent single-document package: prepared, rendered, verified and published by its own
        # engine process, all in parallel (the engine's PDF verification dominates and is single-threaded per run).
        jobs=[]
        for form in forms:
            if not 1 <= len(form['fields']) <= 12:
                raise ValueError('invalid_field_count')
            assets=work/form['id'];assets.mkdir()
            shutil.copyfile(work/'font.ttf',assets/'font.ttf')
            fields={};facts=[];properties={};fact_keys=set()
            path=assets/(form['id']+'.pdf')
            placements=official_background(form,path,source['hash'])
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
                target='field-'+str(i+1)
                page,x,y,width,height=placements[i]
                size=min(11,height/1.5,(width-3)/max(pdfmetrics.stringWidth(value,'DemoKai',1),1))
                if size<6:raise ValueError('field_too_long_for_official_blank:'+key)
                targets[target]={'page':page,'rect':[float(x),float(y),float(width),float(height)],'filled_by':'applicant','control':{'kind':'text','size':float(size)}}
                # Semantic values remain exactly those confirmed by the applicant.
                bindings[target]={'source':{'kind':'field','field':semantic},'transform':{'kind':'identity'}}
            templates={form['id']:{'version':'1','source':{'path':path.name,'sha256':digest(path)},
                'font':{'asset':{'path':'font.ttf','sha256':digest(assets/'font.ttf')},'family':SUBSET_FAMILY},'targets':targets}}
            documents=[{'id':form['id'],'template':form['id'],'condition':{'op':'always'},'repeat_field':None,'bindings':bindings}]
            definition={'schema_version':1,'application':{'id':'frontend-company-demo-'+form['id'],'version':'1.0.0','valid_from':'2026-01-01','valid_to':None,
                'schema':{'$schema':'https://json-schema.org/draft/2020-12/schema','type':'object','additionalProperties':False,'properties':properties,'required':list(fields)},
                'fields':fields,'rules':[],'documents':documents},'templates':templates}
            dump(assets/'definition.json',definition)
            definition_hash=run([str(executable),'check-definition',str(assets/'definition.json')],env)['definition_hash']
            request={'id':'application-v'+str(source['v'])+'-'+form['id'],'application_type':'frontend-company-demo-'+form['id'],'scope':'demo-frontend',
                'as_of':'2026-11-11','roles':roles}
            bundle={'scope':'demo-frontend','read_revision':source['hash'],'grant_id':'demo-confirmed-snapshot','expires_on':'2099-12-31',
                'allowed_fact_ids':[f['id'] for f in facts],'allowed_relationship_ids':[],'approved_definition_hashes':[definition_hash],'facts':facts,'relationships':[]}
            dump(assets/'request.json',request);dump(assets/'facts.json',bundle)
            out=destination/form['id']
            jobs.append((form['id'],out,subprocess.Popen([str(executable),'run','--definition',str(assets/'definition.json'),'--request',str(assets/'request.json'),
                '--fixture-facts',str(assets/'facts.json'),'--now','2026-11-11','--assets',str(assets),'--out',str(out)],
                cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)))
        failures=[]
        for form_id,_,process in jobs:
            stdout,stderr=process.communicate(timeout=300)
            if process.returncode:failures.append(form_id+': '+(stderr.strip() or stdout.strip() or 'core_failed'))
        if failures:raise RuntimeError('; '.join(failures))
        hashes={form_id:json.loads((out/'manifest.json').read_text())['snapshot_hash'] for form_id,out,_ in jobs}
        return {'mode':'demo_only','application_id':source['applicationId'],'frontend_snapshot_hash':source['hash'],
            'snapshot_hash':hashlib.sha256(json.dumps(hashes,sort_keys=True).encode()).hexdigest(),'core_snapshot_hashes':hashes,
            'documents':{form_id:{'path':str(out/'documents'/(form_id+'.pdf')),'sha256':digest(out/'documents'/(form_id+'.pdf'))} for form_id,out,_ in jobs}}

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
