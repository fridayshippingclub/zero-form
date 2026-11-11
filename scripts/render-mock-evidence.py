#!/usr/bin/env python3
"""Generate visibly fictional PDF evidence from the confirmed demo application."""
import argparse
import hashlib
import json
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT=Path(__file__).resolve().parents[1]

def main():
    p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    p.add_argument('--kind',choices=['capital_verification','address_approval','name_approval'],required=True)
    p.add_argument('--scenario',choices=['matching','mismatch','rejected'],default='matching')
    args=p.parse_args();source=json.loads(args.input.read_text());d=source['data']
    if args.out.exists():raise ValueError('output_already_exists')
    pdfmetrics.registerFont(TTFont('DemoTC',str(ROOT/'assets/teammate/NotoSansTC-Regular.ttf')))
    titles={'capital_verification':'會計師資本額核對證明（模擬）','address_approval':'公司地址審查函（模擬）','name_approval':'公司名稱審查函（模擬）'}
    fields={'Document-Type':args.kind,'Company-Name':str(d['company.name'])}
    if args.kind=='capital_verification':fields['Capital-TWD']=str(int(str(d['company.capital']).replace(',',''))+(20000 if args.scenario=='mismatch' else 0))
    if args.kind=='address_approval':fields['Address']=str(d['company.address'])
    fields.update({'Status':'rejected' if args.scenario=='rejected' else 'approved','Issued-On':str(d['app.date']),'Demo-Only':'true'})
    args.out.parent.mkdir(parents=True,exist_ok=True)
    c=canvas.Canvas(str(args.out),pagesize=(595.28,841.89),invariant=1)
    c.setTitle('MOCK / DEMO ONLY - '+titles[args.kind]);c.setFont('Helvetica-Bold',16);c.drawString(40,795,'MOCK / DEMO ONLY / NOT VALID FOR FILING')
    c.setFont('DemoTC',18);c.drawString(40,755,titles[args.kind]);c.setFont('DemoTC',11)
    c.drawString(40,722,'本文件為黑客松合成資料，非會計師或政府機關出具，無任何法律效力。')
    for i,(key,value) in enumerate(fields.items()):
        c.setFont('DemoTC',11);c.drawString(40,665-i*45,f'{key}: {value}')
    c.setFont('Helvetica',10);c.drawString(40,80,'No signature, seal, identity verification or official approval. Page 1 of 1.')
    c.save();print(json.dumps({'path':str(args.out.resolve()),'sha256':hashlib.sha256(args.out.read_bytes()).hexdigest(),'mode':'demo_only'}))

if __name__=='__main__':main()
