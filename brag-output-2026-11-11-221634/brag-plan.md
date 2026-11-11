# Zero Form brag, take 4: less work for staff

**Angle:** Make the reviewer the hero. Today one company registration hands staff 10 documents and 42 blanks to cross-check by hand, and a typo is found by the reviewer. With Zero Form the checking runs *before* submission. The applicant's own self-review catches the mismatch, so staff open one screen where every check has already run, and approve in one click.

**Hook:** The 10 real documents of one application land on the desk. Then the same fact lights up on copy after copy (company name ×10, address ×5, capital ×3), until all 42 blanks are lit: "cross-checked by hand".

**Built on `main` @ 9e85ab6.** Every UI frame comes from a real local run of that commit (`npm run dev` equivalent, demo data, no API key):
- The applicant typed NT$10,000,000. The capital audit report says NT$1,000,000, and self-review flagged the mismatch and locked signing. The applicant fixed the field, all 12 checks passed, and they signed.
- The officer console shows the captured `/api/officer` payload from that run: 5/5 checks, evidence 12/12, documents 7/7. `work/site/officer.js` is the real console with polling swapped for that payload. Its demo controls are hidden.
- The documents in scene 1 are page 1 of the 7 PDFs the engine generated in that run, plus the 3 evidence PDFs it compared against. The field boxes come from `public/setup/fields.json` and `pdftotext -bbox`.

**Numbers on screen, and their sources:**

| Number | Source |
|---|---|
| 10 documents | 7 official forms + 3 required evidence PDFs |
| 42 blanks | `paperFieldCount()` in `public/schema.js` |
| 12 facts | Officer console: "12 facts → 7 forms" |
| 17 checks already run | 5 console checks + 12 evidence checks |

All names and IDs are the repo's fictional demo data. The evidence PDFs are marked as samples.

## Tone and music
`polished`, 120 BPM, 34s = 17 bars.
- 0–9s (the paperwork): D minor, with a ticking 8th-note "clock".
- 9s (the reveal): lifts to F major, with a soft groove from 12.5s and an arpeggio under the console.
- Every SFX lands on the 8th/16th grid: document drops, spotlights, clicks, the "caught" bell, the pass chime, the check pops, approve, and the table strikes.

## Storyboard (34.0s, 1920×1080, 30fps)
| # | Time | Scene |
|---|---|---|
| 1 Desk | 0–9 | **"One company registration: 10 documents."** The real pages drop in. **"Staff check every fact against every copy. By hand."** Company name (10 copies), address (5), capital (3), then all 42 blanks: "42 blanks + 3 evidence PDFs, cross-checked by hand" |
| 2 Turn | 9–12.5 | Logo + **"Zero Form checks it before it reaches staff."** |
| 3 Applicant | 12.5–18.5 | Real self-review. Click *Run self-review*. **"An extra zero? Caught."** The mismatch row is ringed (expected 10000000, observed 1000000, quoting 資本額：新臺幣 1,000,000 元), and *Sign & submit* stays locked. Then **"Fixed by the applicant. Staff never see it."** 12/12 pass and the cursor signs |
| 4 Staff | 18.5–25.5 | Real officer console. **"Staff open one screen. Every check already run."** The 5 checks pop green, then evidence 12/12. It scrolls to 7/7 generated documents matching. **"One click to approve."** → Approved |
| 5 Payoff | 25.5–30.5 | **"A reviewer's workload, per application."** Documents to open: ~~10 PDFs~~ → 1 screen. Values to compare: ~~42 blanks~~ → 12 facts (17 checks already run). Typos caught by: ~~the reviewer~~ → the applicant, before it's submitted |
| 6 Outro | 30.5–34 | Logo + **"Staff review the decision, not the paperwork."** |
