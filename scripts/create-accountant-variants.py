#!/usr/bin/env python3
"""Diverse synthetic originals for source-grounded extraction, not answer sidecars."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'bench/review/accountant-variants'
PRACTICE='零表單展示用會計師事務所'

def begin(path,title):
    c=canvas.Canvas(str(path),pagesize=(595.32,841.92),invariant=1)
    c.setTitle(title+'（展示樣張）');c.setFont('DemoKai',20);c.drawCentredString(297.66,765,title)
    c.setFont('DemoKai',12);c.drawCentredString(297.66,735,PRACTICE)
    return c

def end_page(c,page):
    c.setFont('DemoKai',9);c.drawCentredString(297.66,27,f'展示樣張・非正式簽證・第 {page} 頁')

def build():
    OUT.mkdir(parents=True,exist_ok=True)
    pdfmetrics.registerFont(TTFont('DemoKai',str(ROOT/'assets/fonts/tw-kai/TW-Kai.ttf')))
    for filename,amount in [('prose-roc.pdf','10,000'),('prose-mismatch.pdf','12,000')]:
        c=begin(OUT/filename,'公司設立資本額查核報告')
        lines=['受查公司：大大科技','本展示報告記錄受查公司之實收資本，並供跨文件資料核對。',
          f'經本次展示資料彙整，實收資本為新臺幣 {amount} 元整。',
          '本報告簽證日期：民國 115 年 11 月 11 日',
          '章程訂立日期為 2026 年 11 月 11 日；申請日為 2026 年 12 月 15 日。',
          '上列內容均為合成資料，未進行實際簽證或查核。']
        for i,text in enumerate(lines):c.setFont('DemoKai',12);c.drawString(55,665-i*57,text)
        end_page(c,1);c.save()
    c=begin(OUT/'table-units.pdf','資本查核資料摘要')
    rows=[('受查事業主體','大大科技'),('已收足股款（TWD）','1 萬元'),('簽證日','2026/11/11'),
          ('章程訂立日','2026/11/11'),('申請日','2026/12/15')]
    for i,(label,value) in enumerate(rows):
        y=665-i*66;c.rect(55,y-36,485,57);c.line(265,y-36,265,y+21)
        c.setFont('DemoKai',13);c.drawString(68,y-13,label);c.drawString(285,y-13,value)
    c.setFont('DemoKai',11);c.drawString(55,255,'本摘要採用虛構展示資料，不構成真實會計師簽證意見。');end_page(c,1);c.save()
    c=begin(OUT/'two-page-letter.pdf','資本查核展示文件')
    c.setFont('DemoKai',13);c.drawString(60,650,'本文件之受查公司及簽證資料列於第二頁。')
    c.drawString(60,610,'編製機構僅為展示用名稱，未實施實際查核。')
    c.drawString(60,555,'文件列印日期：2026/12/16（並非查核簽證日期）');end_page(c,1);c.showPage()
    c.setFont('DemoKai',20);c.drawCentredString(297.66,765,'查核資料明細')
    for text,y in [('本案受查公司為 大大科技 。',670),('本案確認之實收資本：NTD 10000',610),
                   ('查核報告簽證日：2026-11-11',550),('申請文件日期：2026-12-15',490),
                   ('以上資料為虛構樣本，不代表正式簽證。',400)]:c.setFont('DemoKai',13);c.drawString(58,y,text)
    end_page(c,2);c.save()
    print(OUT)
if __name__=='__main__':build()
