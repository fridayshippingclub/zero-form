# Haiku semantic extraction test — 2026-11-11

Authorized live model: `claude-haiku-5-5`. Five actual API calls, zero retries:
four forced semantic PDF extractions and one explanation. Total provider usage:
6,170 input tokens and 1,731 output tokens. No credentials or provider response
identifiers are included in these files. The temporary test credential was removed.

| Fixture | Actual extracted capital | Comparison to declared TWD 10,000 | Evidence page |
| --- | ---: | --- | ---: |
| prose-roc.pdf | 10,000 | Match | 1 |
| table-units.pdf | 10,000 | Match | 1 |
| two-page-letter.pdf | 10,000 | Match | 2 |
| prose-mismatch.pdf | 12,000 | Mismatch correctly retained | 1 |

All four extracts identified the company and certification date, retained actual
page/quote/bounding-box evidence, and left the original PDF bytes unchanged.
Expected application values were not sent to extraction; comparison happened
subsequently in deterministic code. `explanation.json` records the fifth call's
explanation, which cannot change the rule result.

These are synthetic, text-bearing accountant examples, not an accuracy benchmark
for arbitrary PDFs or OCR. The four source PDFs are in `../accountant-variants/`.
`summary.json`, per-PDF extraction JSON, and deterministic comparison JSON provide
the observed results rather than a proposed test plan.

Reproduce after explicitly configuring your own key outside the repository:

```sh
ZERO_FORM_ENABLE_LLM=1 python3 demo/evidence_extract.py \
  --input bench/review/accountant-variants/two-page-letter.pdf \
  --kind capital_verification --force-llm
python3 -m unittest discover -s demo -p test_evidence_extract.py
node demo/self-review-smoke.mjs
```

The last two commands are offline tests; the live extraction command incurs API
usage. Server live calls remain disabled unless explicitly opted in. Missing or
unreadable evidence remains unknown rather than being presented as a match.

The integrated browser flow also passed with live calls explicitly disabled:
three draft PDF uploads → 12 passing checks → unknown PDF blocks signing →
restored evidence and a new passing review → OTP → six verified native PDFs →
officer approval. `browser-self-review.json` records this separate UI result;
zero browser errors were observed. This is a local demo, not a government submission.
