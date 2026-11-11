#!/usr/bin/env python3
"""Create a fictional audit-report sample and explicit external-evidence semantics."""
import hashlib
import json
import shutil
from datetime import date
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/pdf'
COMPANY='大大科技'
AMOUNT=10000
CERTIFIED='2026-11-11'

def render_report(path, company, amount, certified):
    day=date.fromisoformat(certified)
    path.parent.mkdir(parents=True,exist_ok=True)
    pdfmetrics.registerFont(TTFont('DemoKai',str(ROOT/'assets/fonts/tw-kai/TW-Kai.ttf')))
    c=canvas.Canvas(str(path),pagesize=(595.28,841.89),invariant=1)
    c.setTitle('資本查核報告書 - 展示樣張');c.setAuthor('Zero Form demonstration studio')
    c.setFillColor(HexColor('#1e2421'))
    c.setFont('DemoKai',22);c.drawCentredString(297.64,755,company)
    c.setFont('DemoKai',25);c.drawCentredString(297.64,715,'資本查核報告書')
    c.setFont('DemoKai',13)
    for text,y in [
        (f'公司名稱：{company}',650),
        (f'資本額：新臺幣 {amount:,} 元',619),
        (f'查核簽證日期：{day.year} 年 {day.month} 月 {day.day} 日',588),
    ]:c.drawString(65,y,text)
    paragraphs=[
      '本報告列示上述公司之示範資本資料，供公司設立申請文件與外部',
      '證明之公司名稱及金額核對。內容採用合成資料，未執行實際查核。',
      '本次展示約定查核簽證日期與章程訂立日期相同，且章程訂立日',
      '不晚於申請日；上述日期核對為展示規則，不代表實際簽證意見。',
    ]
    for text,y in zip(paragraphs,[520,492,438,410]):c.drawString(65,y,text)
    c.setFont('DemoKai',12)
    c.drawString(295,245,'展示單位：零表單展示工作室')
    c.drawString(295,215,f'中華民國 {day.year-1911} 年 {day.month} 月 {day.day} 日')
    c.setFillColor(HexColor('#6f7572'));c.setFont('DemoKai',10)
    c.drawCentredString(297.64,55,'展示樣張・非正式簽證')
    c.save()

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    path=OUT/'mock-capital-audit-report.pdf'
    render_report(path,COMPANY,AMOUNT,CERTIFIED)
    fields=[
      {'key':'document.type','value':'capital_audit_report','source':{'page':1,'label':'資本查核報告書'}},
      {'key':'company.legal_name','value':COMPANY,'source':{'page':1,'label':'公司名稱','machine_label':'公司名稱'},'comparison_target':'declared.company.name'},
      {'key':'capital.paid_in_amount','value':{'value':AMOUNT,'currency':'TWD'},'source':{'page':1,'label':'資本額','machine_label':'資本額'},'comparison_target':'declared.company.capital'},
      {'key':'audit.certified_on','value':CERTIFIED,'source':{'page':1,'label':'查核簽證日期','machine_label':'查核簽證日期'},'comparison_target':'declared.company.articles_date','comparison_policy':'Named demo rule: certification date equals articles date; articles date must be on or before application date. Application date remains a distinct fact.'},
      {'key':'document.demo_only','value':True,'source':{'page':1,'label':'展示樣張・非正式簽證'}},
    ]
    semantic={'schema_version':1,'evidence_kind':'external_document_observations','pdf':path.name,
      'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'document.type':'capital_audit_report','document.demo_only':True,
      'company.legal_name':COMPANY,'capital.paid_in_amount':{'value':AMOUNT,'currency':'TWD'},'audit.certified_on':CERTIFIED,
      'fields':fields,'notice':'Synthetic observations only. This sidecar is not authenticated evidence; extract uploaded PDF bytes independently.'}
    (OUT/'mock-capital-audit-report.semantic.json').write_text(json.dumps(semantic,ensure_ascii=False,indent=2)+'\n')
    catalog_dir=ROOT/'bench/review'
    catalog_dir.mkdir(parents=True,exist_ok=True)
    catalog_pdf=catalog_dir/'capital-audit-report.pdf'
    shutil.copyfile(path,catalog_pdf)
    catalog_semantic={**semantic,'pdf':catalog_pdf.name}
    (catalog_dir/'capital-audit-report.semantic.json').write_text(json.dumps(catalog_semantic,ensure_ascii=False,indent=2)+'\n')
    manifest_path=catalog_dir/'manifest.json'
    if manifest_path.exists():
        manifest=json.loads(manifest_path.read_text())
        manifest['files']=[item for item in manifest['files'] if item['file']!=catalog_pdf.name]
        manifest['files'].append({'file':catalog_pdf.name,'document_type':'capital_verification','sha256':semantic['sha256']})
        manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
    print(path)

if __name__=='__main__':main()
