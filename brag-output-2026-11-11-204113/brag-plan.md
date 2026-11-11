# Zero Form brag, take 3: the real forms

**Angle:** No mock-ups. Three real company-registration PDFs (supplied by the user) go through Zero Form's form reader. Claude reads each page, and the label-locator boxes every field on the real page. The same facts turn up on every form. 18 boxes become 6 facts, asked once.

**Source of every box:** `work/extraction-result.json`. This is a real run of the in-progress reader from the `t3/axd-end-to-end-demo` worktree (`lib/setup-ai.js`, Claude Opus 5.5, and `scripts/extract-form-fields.py locate`). The Claude half ran unchanged. The locator had a punctuation-matching fix applied (`work/label-matching.patch`); without it, 5 change-form fields were missed (`work/extraction-result.before-label-fix.json`).

**Curated for the video:** only the 6 facts shared across forms. Boxes left out as mapping mistakes:
- the `姓名` box under 代理人 (the agent, not the representative)
- 營業場所 (business premises, which isn't necessarily the registered address)
- 原名稱 (the old company name on the change form)
- dates (the merger date and the planned opening date were mapped to the application date)

| Form (page 1) | File | Boxes shown |
|---|---|---|
| 有限公司設立（變更）登記申請書 | 登記申請書.pdf | 6 |
| 有限公司設立登記表 | 設立登記表.pdf | 6 |
| 有限公司變更登記表 | 變更登記表.pdf | 6 |

Facts: 預查編號 (3/3 forms), 公司名稱 (3/3), 代表人姓名 (3/3), 公司所在地 (3/3), 聯絡電話 (3/3, 4 boxes), 資本總額 (2/3).

## Tone and music
`polished`, F major, 120 BPM, 24s = 12 bars. Every box pops as the scan line passes it, snapped to the 16th-note grid with a soft pluck.

## Storyboard (24.0s, 1920×1080, 30fps)
| # | Time | Scene |
|---|---|---|
| 1 | 0–4 | **"3 real company-registration forms."** The three real page-1 renders slide in, with names underneath |
| 2 | 4–10 | **"Claude reads each form and finds every box."** A scan line sweeps each page in turn, and the real boxes pop in, colour-coded by fact. A count under each page ticks up |
| 3 | 10–16 | **"The same facts, on every form."** One fact at a time is spotlit across all 3 pages (company name, representative, address, phone), with a chip like "公司名稱 Company name · 3 of 3 forms" |
| 4 | 16–20 | **"18 boxes. 6 facts. Asked once."** A card lists the 6 facts, each with dots showing which forms ask for it |
| 5 | 20–24 | Logo + **"Read each form once. Ask each fact once."** |
