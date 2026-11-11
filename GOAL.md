# Zero Form — demo goal (definition of done)

**Goal:** a 3-minute live demo, on the real Taipei incorporation page, that a first-time viewer understands instantly and trusts:
"7 government forms → answer ~5 questions once → confirm once with a text code → every form generated → officer verifies with evidence → approves or asks to fix one field."

**UI bar:** Stripe calm + Typeform focus. One question per screen, big type, Enter to continue, one primary action per screen, plain language, visible trust cues (verified badges, sources, text-code confirmation, hash). No clutter.

## Acceptance criteria (each must be demonstrably true)

1. **Embedded on the real site** — with the Chrome extension loaded, `https://tcooc-co.gov.taipei/cp.aspx?n=1ddc8c221b97a1bd&s=5BA095ECA5D6FAB3` shows a "Fill all forms with Zero Form" launcher; clicking it opens a right-side drawer (iframe of `http://localhost:5173/`).
2. **Two-step via known phone** — "Get started" texts a 6-digit code to the phone number already verified on the profile (SMS simulated: code shown in an on-screen message preview, tap to fill). No passwords, no passkeys.
3. **Zero refill** — screen shows facts already known (name, ID, phone, address, company name, business items) with their source; user confirms with one click.
4. **Ask once** — only the missing fields are asked, one per screen (~5): registered address, capital, second director name + national ID, building owner. Each shows "used in N of 7 forms". National ID checksum validated.
5. **Sign once** — review screen → "Sign & submit" → a fresh code bound to the SHA-256 of the canonical snapshot; on confirm the server seals {hash, confirmation} with Ed25519.
6. **Every form generated** — 6 documents rendered from the single snapshot at `/doc/:v/:formId`, each footer shows snapshot hash + document hash.
7. **Officer console** (`/officer.html`) — 5 checks computed live by the server (identity = code confirmed this exact hash, integrity, consistency, evidence, gov records), facts table with source + "in N forms", actions: Approve / Request change on one field / Reject.
8. **Tamper demo** — "Simulate tampering" turns Integrity + Consistency red.
9. **Revision loop** — officer requests change on one field → applicant sees only that field reopened → re-signs → snapshot v2 with `prev` = v1 hash → officer approves → applicant sees Approved.
10. **Agent API** — `GET /api/agent/schema`, `POST /api/agent/draft` let an agent draft answers; only the human can sign.
11. **Feature check** — `npm run check` walks the API through criteria 3–10 and prints PASS/FAIL per feature. Plus an agent reviews the real UI flow against this list. No pixel-precise UI tests.

## Contract (don't break)
Server API in `server.js`; shared schema in `public/schema.js`. Endpoints:
`GET /api/state`, `POST /api/login/send` → `{to, demoCode}`, `POST /api/login/verify {code}`,
`POST /api/answer {values}`, `POST /api/sign/send` → `{hash, to, demoCode}`, `POST /api/sign/verify {code}`,
`GET /doc/:v/:form`, `GET /api/package/:v`, `GET /api/officer`, `POST /api/officer/decide {decision: approve|revise|reject, field?, note?}`,
`GET /api/agent/schema`, `POST /api/agent/draft {values}`, `POST /api/demo/tamper`, `POST /api/demo/reset`.
Run: `npm run dev` → http://localhost:5173 (`PORT`, `DATA_DIR` env override).

## Ownership (parallel work)
- Applicant panel `public/index.html`, `public/app.js`, `public/style.css`, `server.js` — lead.
- Officer console `public/officer.html` (+ own CSS/JS) — agent.
- Chrome extension `extension/` — agent.
- Feature check `scripts/check.mjs` (`npm run check`) — lead. Flow review — reviewer agent.
