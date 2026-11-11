#!/usr/bin/env python3
"""Rebuild explicit synthetic fixtures. Never modifies the downloaded official PDF."""
import hashlib
import json
import subprocess
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

ROOT = Path(__file__).resolve().parents[1]

def sha(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()

def dump(path, value):
    (ROOT / path).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')

def target(x, y, w, h, checkbox=False):
    return dict(page=1, rect=list(map(float, (x,y,w,h))), filled_by='applicant',
                control={'kind':'checkbox'} if checkbox else {'kind':'text','size':11.0})

def synthetic(name, title, entries):
    path = ROOT / f'assets/templates/{name}.pdf'
    c = canvas.Canvas(str(path), pagesize=(595.28,841.89), invariant=1)
    c.setTitle(title + ' — synthetic hackathon fixture')
    c.setFillColor(HexColor('#153F37')); c.rect(0, 795, 595.28, 46, fill=1, stroke=0)
    c.setFillColorRGB(1,1,1); c.setFont('Helvetica-Bold',16); c.drawString(42,811,title)
    c.setFillColor(HexColor('#53675F')); c.setFont('Helvetica',9)
    c.drawString(42,774,'ZERO FORM / SYNTHETIC FIXTURE / NOT A GOVERNMENT FORM')
    for field, label, t in entries:
        x,y,w,h = t['rect']
        c.setFillColor(HexColor('#243D34')); c.setFont('Helvetica',10)
        if t['control']['kind']=='checkbox':
            c.drawString(x+w+12,841.89-y-h+3,label)
        else:
            c.drawString(x,841.89-y+12,label)
        c.setStrokeColor(HexColor('#91A79E')); c.setLineWidth(.5)
        c.rect(x-2,841.89-y-h-2,w+4,h+4,fill=0,stroke=1)
    c.setFillColor(HexColor('#53675F')); c.setFont('Helvetica',9)
    c.drawString(42,42,'Fictional data only. Signatures and authority fields are intentionally blank.')
    c.save()
    return {f:t for f,_,t in entries}

cover = synthetic('application-cover','Application overview',[
    ('company','Applicant organization',target(44,120,440,24)),
    ('number','Organization reference',target(44,185,220,24)),
    ('representative','Representative',target(44,250,440,24)),
    ('contact','Contact person (different role)',target(44,315,440,24)),
    ('date','Application date',target(44,380,220,24)),
    ('certificate','Include certificate request',target(44,445,12,12,True)),
])
certificate = synthetic('certificate-request','Certificate request',[
    ('company','Applicant organization',target(44,145,440,24)),
    ('contact','Certificate contact',target(44,230,440,24)),
    ('email','Contact email',target(44,315,440,24)),
])
branch = synthetic('branch-attachment','Branch attachment',[
    ('company','Parent organization',target(44,140,440,24)),
    ('branch','Branch name',target(44,235,440,24)),
    ('address','Branch address',target(44,330,440,24)),
])
official = {
    'reservation':target(205,120,340,14),
    'representative':target(205,227,180,18),
    'email':target(148,532,127,21),
}
font={'asset':{'path':'assets/fonts/NotoSans-Regular.ttf','sha256':sha('assets/fonts/NotoSans-Regular.ttf')},'family':'Noto Sans'}
templates={}
for name, file, targets in [
    ('cover','application-cover',cover),('certificate','certificate-request',certificate),
    ('branch','branch-attachment',branch),('official','taiwan-company-application',official),
]:
    path=f'assets/templates/{file}.pdf'
    templates[name]={'version':'1','source':{'path':path,'sha256':sha(path)},'font':font,'targets':targets}

raw=[
 ('company.name','company','legal_name','Harbor Labs'),
 ('company.reference','company','registration_reference','DEMO-0042'),
 ('representative.name','representative','name','Alex Morgan'),
 ('contact.name','contact','name','Jamie Park'),
 ('contact.email','contact','email','jamie@example.test'),
 ('application.date','company','application_date','2026-11-11'),
 ('application.reservation','company','reservation_number','1150000000'),
 ('application.certificate','company','include_certificate',True),
 ('company.branches','company','branches',[
     {'id':'north','name':'North Office','address':'10 Example Street'},
     {'id':'south','name':'South Office','address':'20 Sample Avenue'}]),
 ('capital.first','company','first_contribution',6000),
 ('capital.second','company','second_contribution',4000),
 ('capital.total','company','capital_total',10000),
]
fields={k:{'role':role,'predicate':pred,'require_verification_event': k=='representative.name'} for k,role,pred,value in raw}
properties={}
for k,role,pred,value in raw:
    if isinstance(value,bool): spec={'type':'boolean'}
    elif isinstance(value,int): spec={'type':'integer','minimum':0}
    elif isinstance(value,list): spec={'type':'array','minItems':1,'maxItems':32,'items':{'type':'object','additionalProperties':False,'properties':{f:{'type':'string','minLength':1} for f in ['id','name','address']},'required':['id','name','address']}}
    else: spec={'type':'string','minLength':1,'maxLength':200}
    properties[k]=spec
properties['application.date']['format']='date'
properties['contact.email']['format']='email'

def bind(field, transform=None):
    return {'source':{'kind':'field','field':field},'transform':transform or {'kind':'identity'}}
def document(id, template, bindings, condition=None, repeat=None):
    return {'id':id,'template':template,'condition':condition or {'op':'always'},'repeat_field':repeat,'bindings':bindings}

documents=[
 document('01-overview','cover',{
   'company':bind('company.name'),'number':bind('company.reference'),'representative':bind('representative.name'),
   'contact':bind('contact.name'),'date':bind('application.date'),'certificate':bind('application.certificate')}),
 document('02-official-form','official',{'reservation':bind('application.reservation'),'representative':bind('representative.name'),'email':bind('contact.email')}),
 document('03-certificate','certificate',{'company':bind('company.name',{'kind':'uppercase'}),'contact':bind('contact.name'),'email':bind('contact.email')},
    {'op':'equals','field':'application.certificate','value':True}),
 document('04-branch','branch',{'company':bind('company.name'),
    'branch':{'source':{'kind':'item','pointer':'/name'},'transform':{'kind':'identity'}},
    'address':{'source':{'kind':'item','pointer':'/address'},'transform':{'kind':'identity'}}},repeat='company.branches'),
]
bundle={'schema_version':1,'application':{
 'id':'company-application-demo','version':'1.0.0','valid_from':'2026-01-01','valid_to':None,
 'schema':{'$schema':'https://json-schema.org/draft/2020-12/schema','type':'object','additionalProperties':False,'properties':properties,'required':list(fields)},
 'fields':fields,
 'rules':[
  {'id':'representation','version':'1','source':'fixture-policy: representation required for this demo','check':{'kind':'relationship','from_role':'representative','to_role':'company','relation':'represents'}},
  {'id':'capital-sum','version':'1','source':'fixture-policy: exact integer TWD totals','check':{'kind':'sum','fields':['capital.first','capital.second'],'total':'capital.total','unit':'TWD'}},
  {'id':'certificate-email','version':'1','source':'fixture-policy: certificate contact required','check':{'kind':'required_when','condition':{'op':'equals','field':'application.certificate','value':True},'field':'contact.email'}},
 ],'documents':documents},'templates':templates}
dump('bench/demo/definition.json',bundle)
request={'id':'hackathon-demo','application_type':'company-application-demo','scope':'demo-workspace','as_of':'2026-11-11','roles':{'company':'org-harbor','representative':'person-alex','contact':'person-jamie'}}
dump('bench/demo/request.json',request)
facts=[]
for i,(key,role,predicate,value) in enumerate(raw):
    facts.append({'id':f'fact-{i+1:02}','subject':request['roles'][role],'predicate':predicate,'value':value,'revision':'1',
      'source':f'fictional-profile:{key}','confirmation':'confirmed','verification_event':'fixture-event-001' if role=='representative' else None,
      'valid_from':'2026-01-01','valid_to':None})
result=subprocess.run(['cargo','run','--quiet','--locked','-p','zero-form-cli','--','check-definition','bench/demo/definition.json'],cwd=ROOT,check=True,capture_output=True,text=True)
definition_hash=json.loads(result.stdout)['definition_hash']
fixture={'scope':'demo-workspace','read_revision':'profile-bundle-v1','grant_id':'fixture-grant-001','expires_on':'2026-12-31',
 'allowed_fact_ids':[f['id'] for f in facts],'allowed_relationship_ids':['relationship-001'],'approved_definition_hashes':[definition_hash],
 'facts':facts,'relationships':[{'id':'relationship-001','from':'person-alex','to':'org-harbor','kind':'represents','application_type':'company-application-demo',
 'revision':'1','source':'fixture-policy: fictional representative relationship','valid_from':'2026-01-01','valid_to':None}]}
dump('bench/demo/facts.json',fixture)
dump('bench/demo/expected.json',{'documents':['01-overview','02-official-form','03-certificate','04-branch--north','04-branch--south'],
 'company':'Harbor Labs','representative':'Alex Morgan','contact':'Jamie Park','email':'jamie@example.test','branches':['North Office','South Office'],
 'note':'One official blank PDF plus three synthetic templates. This is not an official complete filing package.'})
dump('assets/sources.json',{'official_pdf':{'url':'https://gcis.nat.gov.tw/mainNew/matterAction.do?fileNo=t70435_p&method=showFile','sha256':sha('assets/templates/taiwan-company-application.pdf'),
 'note':'Unmodified public two-page blank form. Only three supplied fields are demonstrated; not filing-ready.'},
 'font':{'url':'https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf','sha256':font['asset']['sha256'],'license':'OFL-1.1'},
 'synthetic_templates':['application-cover.pdf','certificate-request.pdf','branch-attachment.pdf']})
print('Created an English fixture application with five document outputs.')
