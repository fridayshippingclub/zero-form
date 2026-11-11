#!/usr/bin/env python3
"""Create a fictional audit-report sample and explicit external-evidence semantics."""
import hashlib
import json
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

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    pdfmetrics.registerFont(TTFont('DemoTC',str(ROOT/'assets/teammate/NotoSansTC-Regular.ttf')))
    path=OUT/'mock-capital-audit-report.pdf'
    c=canvas.Canvas(str(path),pagesize=(595.28,841.89),invariant=1)
    c.setTitle('資本查核報告書 - 示範文件');c.setAuthor('Zero Form fictional demo issuer')
    c.setFillColor(HexColor('#9c3b22'));c.rect(0,801,595.28,41,fill=1,stroke=0)
    c.setFillColor(HexColor('#ffffff'));c.setFont('DemoTC',12)
    c.drawCentredString(297.64,815,'示範文件／非正式簽證／不得送件')
    c.setFillColor(HexColor('#173b38'));c.setFont('DemoTC',27)
    c.drawCentredString(297.64,750,'資本查核報告書')
    c.setFont('DemoTC',11);c.setFillColor(HexColor('#6b7776'))
    c.drawCentredString(297.64,726,'公司設立流程概念驗證用・全合成示意資料')
    c.setStrokeColor(HexColor('#b5c7bf'));c.line(49,703,546,703)
    highlights=[('公司名稱',COMPANY),('資本額',f'新臺幣 {AMOUNT:,} 元'),('查核簽證日期','2026 年 11 月 11 日')]
    for i,(label,value) in enumerate(highlights):
        y=661-i*65
        c.setFillColor(HexColor('#edf3ef'));c.roundRect(49,y-30,497,54,6,fill=1,stroke=0)
        c.setFillColor(HexColor('#50655d'));c.setFont('DemoTC',11);c.drawString(65,y+4,label)
        c.setFillColor(HexColor('#173b38'));c.setFont('DemoTC',16);c.drawString(203,y,value)
    c.setFillColor(HexColor('#2c3d39'));c.setFont('DemoTC',11)
    paragraphs=[
      '本示範報告採用上列虛構公司及金額，展示外部資本證明與設立申請資料',
      '之交叉核對。本文件未執行真實查核，亦未驗證資金到位或任何銀行資料。',
      '查核簽證日期為本報告獨立的示範欄位，不等同申請日期或章程日期；',
      '此處不預設各日期應相同。本文件不構成會計師簽證、審計意見或核准。',
    ]
    for text,y in zip(paragraphs,[482,460,426,404]):c.drawString(49,y,text)
    c.setFont('DemoTC',10);c.setFillColor(HexColor('#6b7776'))
    c.drawString(49,365,'虛構出具單位：零表單示範文件工作室（非會計師事務所）')
    c.drawString(49,345,'本文件不設簽名、印章、證照號碼或真實出具人。')
    c.setStrokeColor(HexColor('#d6ded9'));c.line(49,320,546,320)
    c.setFont('DemoTC',9);c.drawString(49,298,'供示範系統擷取之欄位（文字值與上方相同）')
    machine=[('Document-Type','capital_verification'),('Company-Name',COMPANY),('Capital-TWD',str(AMOUNT)),
             ('Certified-On',CERTIFIED),('Demo-Only','true'),('Status','approved')]
    c.setFillColor(HexColor('#40544c'));c.setFont('DemoTC',9)
    for i,(label,value) in enumerate(machine):c.drawString(49,274-i*21,f'{label}: {value}')
    c.setFillColor(HexColor('#9c3b22'));c.setFont('DemoTC',10)
    c.drawString(49,116,'Status 僅為展示流程狀態，不代表真實查核通過或政府核准。')
    c.setFont('Helvetica',9);c.setFillColor(HexColor('#6b7776'))
    c.drawString(49,64,'MOCK / DEMO ONLY / NOT VALID FOR FILING');c.drawRightString(546,64,'Page 1 of 1')
    c.save()
    fields=[
      {'key':'document.type','value':'capital_audit_report','source':{'page':1,'label':'資本查核報告書'}},
      {'key':'company.legal_name','value':COMPANY,'source':{'page':1,'label':'公司名稱','machine_label':'Company-Name'},'comparison_target':'declared.company.name'},
      {'key':'capital.paid_in_amount','value':{'value':AMOUNT,'currency':'TWD'},'source':{'page':1,'label':'資本額','machine_label':'Capital-TWD'},'comparison_target':'declared.company.capital'},
      {'key':'audit.certified_on','value':CERTIFIED,'source':{'page':1,'label':'查核簽證日期','machine_label':'Certified-On'},'comparison_target':None,'comparison_policy':'Independent certification date; no default equality with application or articles dates.'},
      {'key':'document.demo_only','value':True,'source':{'page':1,'label':'示範文件／非正式簽證／不得送件','machine_label':'Demo-Only'}},
    ]
    semantic={'schema_version':1,'evidence_kind':'external_document_observations','pdf':path.name,
      'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'document.type':'capital_audit_report','document.demo_only':True,
      'company.legal_name':COMPANY,'capital.paid_in_amount':{'value':AMOUNT,'currency':'TWD'},'audit.certified_on':CERTIFIED,
      'fields':fields,'notice':'Synthetic observations only. This sidecar is not authenticated evidence; extract uploaded PDF bytes independently.'}
    (OUT/'mock-capital-audit-report.semantic.json').write_text(json.dumps(semantic,ensure_ascii=False,indent=2)+'\n')
    print(path)

if __name__=='__main__':main()
