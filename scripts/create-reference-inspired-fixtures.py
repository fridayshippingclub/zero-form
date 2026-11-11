#!/usr/bin/env python3
"""Synthetic structure studies; never reads private originals or copies their data."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'bench/review/reference-inspired'
COMPANY='大大科技';PERSON='陳大文';ADDRESS='示範市測試區虛構路 10 號 2 樓'

def start(name,title):
 c=canvas.Canvas(str(OUT/name),pagesize=(595.32,841.92),invariant=1)
 c.setTitle(title+'（展示樣張）');c.setFont('DemoKai',19);c.drawCentredString(297.66,783,title)
 c.setFont('DemoKai',10);c.drawCentredString(297.66,759,'零表單展示用審查單位');return c

def text(c,x,y,value,size=12):c.setFont('DemoKai',size);c.drawString(x,y,value)
def finish(c):
 c.setFont('DemoKai',8);c.drawCentredString(297.66,25,'展示樣張・全部資料虛構・非核准文件・不得送件');c.save()
def rows(c,items,y=700):
 for label,value in items:
  c.rect(48,y-38,499,42);c.line(175,y-38,175,y+4)
  text(c,58,y-20,label,11);text(c,186,y-20,value,11);y-=42
 return y

def build():
 OUT.mkdir(parents=True,exist_ok=True);pdfmetrics.registerFont(TTFont('DemoKai',str(ROOT/'assets/fonts/tw-kai/TW-Kai.ttf')))
 for shape in ['letter','table']:
  c=start('name-'+shape+'.pdf','公司名稱及所營事業預查結果')
  if shape=='letter':
   text(c,48,713,'預查編號：DEMO-NAME-0001',10);text(c,325,713,'保留期限：2027-05-11',10)
   c.line(48,698,547,698)
   for i,line in enumerate(['發文日期：2026-11-11','申請項目：公司設立名稱預查','審查結果：核准保留（模擬結果）',f'公司名稱：{COMPANY}',
     '一、所營事業項目','　　F119010　電子材料批發業','　　F113050　事務性機器設備批發業','二、審查說明','　　本展示案件僅表達名稱保留，不代表公司已設立。',
     f'申請人：{PERSON}','識別代碼：DEMO-PERSON-0001',f'通訊處所：{ADDRESS}']):text(c,52,665-i*31,line,12)
  else:
   y=rows(c,[('案號','DEMO-NAME-0002'),('發文日期','2026-11-11'),('公司名稱',COMPANY),('申請事項','設立預查'),('結果','核准保留（模擬）'),('保留截止日','2027-05-11')])
   text(c,48,y-36,'所營事業',13);text(c,60,y-67,'F119010　電子材料批發業',11);text(c,60,y-94,'F113050　事務性機器設備批發業',11)
   text(c,48,y-150,'注意：名稱保留與公司設立核准為不同事項。',11)
  text(c,48,110,'本頁以虛構案例展示文書結構，不具有任何核准效力。',10);finish(c)
 for shape in ['letter','table']:
  c=start('address-'+shape+'.pdf','營業場所使用條件預查結果')
  if shape=='letter':
   for i,line in enumerate(['案號：DEMO-ADDR-0001','發文日期：2026-11-11',f'公司名稱：{COMPANY}',f'地址：{ADDRESS}',
    '一、申請用途：辦公室','二、土地使用意見：符合本展示案例設定之辦公室用途。','三、建築管理意見：限指定二樓使用，不含其他樓層。',
    '四、限制條件：不含倉儲、製造、批發或現場零售用途。','五、此結果具有用途與樓層條件，不代表所有營業項目均可。']):text(c,48,704-i*45,line,12)
  else:
   y=rows(c,[('案號','DEMO-ADDR-0002'),('申請人',COMPANY),('營業場所',ADDRESS),('發文日期','2026-11-11'),('使用執照識別','DEMO-LICENSE-0001')])
   y-=35
   for x,w,label in [(48,135,'查詢項目'),(183,180,'土地使用意見'),(363,184,'建築管理意見')]:c.rect(x,y-32,w,32);text(c,x+12,y-21,label,11)
   c.rect(48,y-157,499,125);c.line(183,y-32,183,y-157);c.line(363,y-32,363,y-157)
   for x,lines in [(58,['I301010','資訊軟體服務業','展示用途：辦公室']), (195,['辦公室用途符合','以本表指定處所為限','用途變更須另行確認']), (375,['限二樓辦公室使用','不得作倉儲或製造','其他樓層未納入查核'])]:
    for i,line in enumerate(lines):text(c,x,y-65-i*25,line,10)
   text(c,48,y-200,'結論：附條件符合；仍須核對實際用途及樓層範圍。',11)
  text(c,48,110,'本頁所有處所、案件與許可識別皆虛構，並非正式核准。',10);finish(c)
 c=start('client-declaration-not-audit.pdf','客戶資料聲明書')
 text(c,48,705,'受文者：零表單展示用會計師事務所',12)
 for i,line in enumerate([f'聲明人：{PERSON}',f'公司名稱：{COMPANY}','聲明日期：2026-11-11',
  '一、本人提供之展示資料均為合成資訊。','二、本文件由客戶提供聲明，並非會計師查核報告。','三、資金來源、出資金額及簽證日期均未在本聲明中確認。',
  '　　□境內資金　□境外資金　（未勾選）','四、不得據此推定資本額經查核或已取得簽證。','簽署欄：留白（本展示不製作簽名或印章）']):text(c,48,660-i*42,line,12)
 finish(c);print(OUT)
if __name__=='__main__':build()
