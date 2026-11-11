#!/usr/bin/env python3
"""One-time agency setup: find each field label on the official PDF page, record its box, render the page.
Writes public/setup/<form>.png and public/setup/fields.json (consumed by /setup.html).
`locate <form-id>` reads [{label, fact, meaning}] JSON on stdin (e.g. from Claude) and prints boxes for them."""
import json, re, subprocess, html, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/setup'
SRC = 'https://gcis.nat.gov.tw/mainNew/matterAction.do?method=showFile&fileNo='
# (form id, name, english, source url, [(label as printed, fact key, nth occurrence, extend-right pts)])
FORMS = [
  ('app', '公司設立登記申請書', 'Application letter', 'https://www-ws.gov.taipei/001/Upload/676/relfile/43122/105581/6420cf31-ad92-4f72-baa5-f34a70a127b9.pdf', [
    ('預查編號', 'reservation.id', 0, 220), ('公司名稱', 'company.name', 0, 300), ('代表人姓名', 'person.name', 0, 300),
    ('公司所在地', 'company.address', 0, 300), ('聯絡電話', 'person.phone', 0, 120), ('申請日期', 'app.date', 0, 200)]),
  ('t70126', '章程', 'Articles of incorporation', SRC.replace('mainNew/matterAction.do?method=showFile&fileNo=', 'F/') + 't70126_p', [
    ('定名為', 'company.name', 0, 90), ('經營之事業如下', 'company.items', 0, 40), ('本公司設於', 'company.address', 0, 90),
    ('資本總額定為新臺幣', 'company.capital', 0, 70), ('股東姓名或名稱', 'person.name', 0, 160)]),
  ('t70135', '有限公司設立登記表', 'Registration form', SRC + 't70135_p', [
    ('公司預查編號', 'reservation.id', 0, 180), ('公司聯絡電話', 'person.phone', 0, 180), ('公司名稱', 'company.name', 0, 330),
    ('公司所在地', 'company.address', 0, 330), ('資本總額', 'company.capital', 0, 330), ('代表人姓名', 'person.name', 0, 120),
    ('公司章程訂定日期', 'app.date', 0, 250)]),
]

def words(pdf):
    out = subprocess.run(['pdftotext', '-bbox', '-f', '1', '-l', '1', str(pdf), '-'], capture_output=True, text=True, check=True).stdout
    page = re.search(r'<page width="([\d.]+)" height="([\d.]+)"', out)
    ws = [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in
          re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', out)]
    return float(page[1]), float(page[2]), ws

def find(ws, label, nth=0):
    text, owner = '', []
    for i, w in enumerate(ws):
        for ch in re.sub(r'\s+', '', w[4]):
            text += ch; owner.append(i)
    hits = [m.start() for m in re.finditer(re.escape(label), text)]
    if len(hits) <= nth: return None
    idx = sorted({owner[j] for j in range(hits[nth], hits[nth] + len(label))})
    sel = [ws[i] for i in idx]
    return [min(w[0] for w in sel), min(w[1] for w in sel), max(w[2] for w in sel), max(w[3] for w in sel)]

def box(W, H, x0, y0, x1, y1, ext):
    x1 = min(x1 + ext, W - 30)
    return [round(x0 / W * 100, 2), round((y0 - 3) / H * 100, 2), round((x1 - x0) / W * 100, 2), round((y1 - y0 + 6) / H * 100, 2)]

def locate(fid, fields):
    W, H, ws = words(ROOT / 'bench/forms' / f'{fid}.pdf')
    out, missed = [], []
    for f in fields:
        label = re.sub(r'\s+', '', f.get('label', ''))
        hit = None
        for cand in [label] + [label[:n] for n in range(len(label) - 1, 2, -1)]:  # exact first, then the longest printed prefix (3+ chars)
            hit = find(ws, cand) if cand else None
            if hit: break
        if not hit: missed.append(f.get('label')); continue
        out.append({**f, 'box': box(W, H, *hit, 120)})
    return {'fields': out, 'missed': missed}

if len(sys.argv) == 3 and sys.argv[1] == 'locate':
    print(json.dumps(locate(sys.argv[2], json.load(sys.stdin)), ensure_ascii=False)); sys.exit(0)

result = []
OUT.mkdir(parents=True, exist_ok=True)
for fid, name, en, url, fields in FORMS:
    pdf = ROOT / 'bench/forms' / f'{fid}.pdf'
    W, H, ws = words(pdf)
    subprocess.run(['pdftoppm', '-r', '110', '-f', '1', '-l', '1', '-singlefile', '-png', str(pdf), str(OUT / fid)], check=True)
    boxes = []
    for label, key, nth, ext in fields:
        hit = find(ws, label, nth)
        if not hit: raise SystemExit(f'label not found: {label}')
        boxes.append({'label': label, 'fact': key, 'box': box(W, H, *hit, ext)})
    result.append({'id': fid, 'name': name, 'en': en, 'source': url, 'image': f'/setup/{fid}.png', 'aspect': round(H / W, 4), 'fields': boxes})
(OUT / 'fields.json').write_text(json.dumps(result, ensure_ascii=False, indent=1))
print(json.dumps({f['id']: len(f['fields']) for f in result}))
