#!/usr/bin/env python3
"""One-time agency setup: find each field label on the official PDF page, record its box, render the page.
Writes public/setup/<form>.png and public/setup/fields.json (consumed by /setup.html).
`locate <form-id>` reads [{label, fact, meaning}] JSON on stdin (e.g. from Claude) and prints boxes for them."""
import json, re, subprocess, html, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/setup'
GCIS = 'https://gcis.nat.gov.tw/F/'
# Every fillable official form on Step 1 + Step 4 of the Taipei registration page; ids match the engine (app = GCIS t70433).
# bench/forms/<id>.pdf are byte-identical copies of assets/official/<gcis id>.pdf (see assets/official/sources.json).
# (form id, name, english, source url, [(label as printed on page 1, fact key, nth occurrence, extend pts: right or (left, right))])
FORMS = [
  ('c00001', '公司名稱及所營事業登記預查申請表', 'Name reservation', GCIS + 'c00001_p', [
    ('姓名(或法人名', 'person.name', 0, 155), ('身分證（或法人）', 'person.nationalId', 0, 148), ('聯絡電話', 'person.phone', 0, 190),
    ('戶籍地址', 'person.address', 0, 154), ('之公司名稱', 'company.name', 0, (-140, 120)), ('營業項目代碼', 'company.items', 0, 250)]),
  ('app', '公司設立登記申請書', 'Application letter', GCIS + 't70433_p', [
    ('預查編號', 'reservation.id', 0, 200), ('公司名稱', 'company.name', 0, 205), ('代表人姓名', 'person.name', 0, 200),
    ('公司所在地', 'company.address', 0, 300), ('申請日期', 'app.date', 0, 280), ('聯絡人姓名', 'person.name', 0, 140), ('市話/手機', 'person.phone', 0, 120)]),
  ('t70126', '章程', 'Articles of incorporation', GCIS + 't70126_p', [
    ('定名為', 'company.name', 0, 90), ('經營之事業如下', 'company.items', 0, 40), ('本公司設於', 'company.address', 0, 90),
    ('資本總額定為新臺幣', 'company.capital', 0, 70), ('股東姓名或名稱', 'person.name', 0, 160)]),
  ('t70130', '股東同意書', 'Shareholder consent', GCIS + 't70130_p', [
    ('有限公司', 'company.name', 0, (-180, 0)), ('股東姓名', 'person.name', 0, 140), ('中華民國', 'app.date', 0, 300)]),
  ('t70132', '董事願任同意書', 'Director consent', GCIS + 't70132_p', [
    ('本人同意擔任', 'company.name', 0, 118), ('立同意書人', 'person.name', 0, 150), ('中華民國', 'app.date', 0, 300)]),
  ('t70124', '建物所有權人同意書', 'Building owner consent', GCIS + 't70124_p', [
    ('房屋所有權人', 'owner.name', 0, 10), ('門牌', 'company.address', 0, (-45, 0)), ('公司（分公司）名稱', 'company.name', 0, (-30, 30)),
    ('立同意書人：（姓', 'owner.name', 0, 60), ('中華民國', 'app.date', 0, 300)]),
  ('t70135', '有限公司設立登記表', 'Registration form', GCIS + 't70135_p', [
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
    left, right = ext if isinstance(ext, tuple) else (0, ext)
    x0, x1 = max(x0 + left, 30), min(x1 + right, W - 30)
    return [round(x0 / W * 100, 2), round((y0 - 3) / H * 100, 2), round((x1 - x0) / W * 100, 2), round((y1 - y0 + 6) / H * 100, 2)]

def locate(fid, fields):
    W, H, ws = words(ROOT / 'bench/forms' / f'{fid}.pdf')
    out, missed = [], []
    for f in fields:
        label = re.sub(r'\s+', '', f.get('label', ''))
        hit = None
        # exact first, then the longest printed prefix or suffix (labels split across lines or interleaved with English), down to 2 chars
        for cand in [label] + [c for n in range(len(label) - 1, 1, -1) for c in (label[:n], label[-n:])]:
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
