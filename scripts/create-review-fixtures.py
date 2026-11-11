#!/usr/bin/env python3
"""Build fictional, visibly marked external evidence for the hackathon demo.

The catalog is a scenario index, never verification evidence. Upload consumers
must extract fields from the uploaded PDF bytes and compare them with the case.
"""
import hashlib
import json
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'bench' / 'review'
FIXTURES = [
    ('capital-approved.pdf', 'capital_verification', 'Capital verification', 'approved', {'Capital-TWD': '10000'}),
    ('address-approved.pdf', 'address_approval', 'Address review', 'approved', {'Address': '10 Example Street'}),
    ('name-approved.pdf', 'name_approval', 'Company name review', 'approved', {}),
    ('capital-mismatch.pdf', 'capital_verification', 'Capital verification', 'approved', {'Capital-TWD': '12000'}),
    ('name-rejected.pdf', 'name_approval', 'Company name review', 'rejected', {}),
]


def build():
    pdfmetrics.registerFont(TTFont('DemoKai', str(ROOT / 'assets/fonts/tw-kai/TW-Kai.ttf')))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    catalog = []
    for filename, kind, title, status, specifics in FIXTURES:
        path = OUTPUT / filename
        pdf = canvas.Canvas(str(path), pagesize=A4, invariant=1)
        pdf.setTitle(f'MOCK - {title} - Harbor Labs')
        pdf.setAuthor('Zero Form hackathon fixture generator')
        width, height = A4
        pdf.setFillColor(HexColor('#142d38'))
        pdf.rect(0, height - 150, width, 150, fill=1, stroke=0)
        pdf.setFillColor(HexColor('#f8cc7b'))
        pdf.setFont('DemoKai', 14)
        pdf.drawString(44, height - 42, 'MOCK / DEMO ONLY')
        pdf.setFillColor(HexColor('#ffffff'))
        pdf.setFont('DemoKai', 25)
        pdf.drawString(44, height - 83, title)
        pdf.setFont('DemoKai', 12)
        pdf.drawString(44, height - 112, 'Fictional supporting document - Harbor Labs')
        pdf.setFillColor(HexColor('#a84220'))
        pdf.setFont('DemoKai', 14)
        pdf.drawString(44, height - 188, 'NOT VALID FOR FILING')
        pdf.setFillColor(HexColor('#263d47'))
        pdf.setFont('DemoKai', 11)
        pdf.drawString(44, height - 216, 'No accountant, public authority or real institution issued this document.')
        fields = {'Document-Type': kind, 'Company-Name': 'Harbor Labs', **specifics,
                  'Status': status, 'Issued-On': '2026-11-11', 'Demo-Only': 'true'}
        y = height - 262
        for label, value in fields.items():
            pdf.setFillColor(HexColor('#f0f4f5'))
            pdf.roundRect(40, y - 12, width - 80, 33, 3, fill=1, stroke=0)
            pdf.setFillColor(HexColor('#142d38'))
            pdf.setFont('DemoKai', 11)
            pdf.drawString(51, y, f'{label}: {value}')
            y -= 45
        pdf.setFont('DemoKai', 12)
        pdf.drawString(44, y - 18, 'Scenario note')
        pdf.setFont('DemoKai', 11)
        note = ('Mock name review returned rejected; reviewer must inspect this result.'
                if status == 'rejected' else
                'This document reports a different capital amount from the demo application.'
                if filename == 'capital-mismatch.pdf' else
                'These fictional values match the standard demo application.')
        pdf.drawString(44, y - 40, note)
        pdf.setStrokeColor(HexColor('#d2dce0'))
        pdf.line(44, 94, width - 44, 94)
        pdf.setFillColor(HexColor('#6b7680'))
        pdf.setFont('DemoKai', 10)
        pdf.drawString(44, 73, 'DEMO ONLY | No signature, seal, attestation or legal approval')
        pdf.drawString(44, 56, 'Generated for software integration testing. Page 1 of 1.')
        pdf.showPage()
        pdf.save()
        catalog.append({'file': filename, 'document_type': kind, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    manifest = {
        'schema_version': 1, 'demo_only': True,
        'notice': 'Catalog only. Extract actual uploaded PDF text; never trust this catalog as evidence.',
        'application': {'company_name': 'Harbor Labs', 'capital_twd': 10000, 'address': '10 Example Street'},
        'files': catalog,
        'scenarios': {
            'matching': ['capital-approved.pdf', 'address-approved.pdf', 'name-approved.pdf'],
            'capital_mismatch': ['capital-mismatch.pdf', 'address-approved.pdf', 'name-approved.pdf'],
            'missing_address': ['capital-approved.pdf', 'name-approved.pdf'],
            'name_rejected': ['capital-approved.pdf', 'address-approved.pdf', 'name-rejected.pdf'],
        },
    }
    (OUTPUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Created {len(catalog)} mock PDFs and scenario catalog in {OUTPUT}')


if __name__ == '__main__':
    build()
