# Zero Form — brag plan

**What it is:** One input layer for Taipei company registration. Answer a few questions once, and every government form is filled from one signed snapshot.
**For:** Founders registering a company in Taipei (and the officers who review them).
**Sets it apart:** It reuses verified facts, asks only what's missing, and you sign once. 3 answers fill 40 fields across 7 forms.
**Hook:** A stack of 7 real Taipei incorporation forms slams in, one per beat. Then they all fill themselves.
**Share caption:** Registering a company in Taipei means 7 forms and 40 fields. Zero Form asks 3 questions.

## Angle
Simplest possible story: *pile of forms → one conversation → done.* The real app UI does the talking.

## Tone and identity
`polished`: restrained, few scenes, soft dips between them.
- Paper `#F5F5F2`, ink `#0E1116`, accent `#2B50FF`, confirmation green `#0F8A4F`
- Inter and Noto Sans TC (the app's own fonts)
- Real `public/style.css` and `public/schema.js` (`docBody`) render the app screens and the live form packet
- Demo data is the repo's fictional seed profile (陳大文, A123456789, 大大科技有限公司). No real personal data.

## Music
120 BPM (1 beat = 0.5s, 1 bar = 2s), F major, soft pads + plucked arpeggio + light kick/hat. Every cut lands on a beat, and sound effects (typing ticks, chime on reveal, chime on signed) sit on the same grid.

## Storyboard (20.0s, 30fps, 1920×1080)
| # | Time | Beats | Scene |
|---|---|---|---|
| 1 Hook | 0.0–3.5 | 7 | "Starting a company in Taipei?" 7 form cards (real names: 公司設立登記申請書, 章程…) land one per half-beat; counter reads **7 forms · 40 fields** |
| 2 Reveal | 3.5–6.0 | 5 | Dip to paper. The forms collapse into the Zero Form logo. **Answer once. Confirm once.** |
| 3 Ask | 6.0–12.0 | 12 | Real question screen: "How much capital are you starting with?" Typing NT$ 1,000,000 while the live packet beside it fills, with highlights jumping across forms. Caption: **3 questions. Every form fills live.** |
| 4 Sign | 12.0–16.0 | 8 | Real done screen: Submitted badge, signed SHA-256 snapshot card, 6 generated documents ticking in. Caption: **Sign once. Every document generated.** |
| 5 Outro | 16.0–20.0 | 8 | Logo + **Every government form, filled.** |
