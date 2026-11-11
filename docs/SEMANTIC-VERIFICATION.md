# External evidence cross-validation

**PASS — four isolated PDF mismatches block the signing request.** Tested on
11 November 2026 through the local upload and self-review HTTP endpoints, using
visibly synthetic PDFs. No live model calls or credentials were used.

| Check | Application value | Uploaded PDF value | Result |
| --- | --- | --- | --- |
| Address precheck | 臺北市大安區仁愛路四段 1 號 | 示範市測試區不同路 99 號 | Mismatch; signing blocked |
| Name reservation | 大大科技 | 另一家展示科技 | Mismatch; signing blocked |
| Capital | TWD 10,000,000 | TWD 1,000,000 | Mismatch; signing blocked |
| Certification date vs. articles date | 2026-11-11 | 2026-11-10 | Mismatch; signing blocked |

Each case changes only one uploaded document. The test checks the exact expected
and observed values, the extracted page-one quote, the evidence link and the
original PDF SHA256. All other comparison checks pass. `/api/sign/send` returns
`409` after each mismatch; restoring the matching PDF and rerunning self-review
returns `ready_to_submit` and allows that request again.

A blank PDF separately returns `unknown` and blocks signing; restoring matching
evidence clears it. Editing draft facts invalidates the previous review and
requires a new review. No native document generation or government submission is
performed by this test.

Reproduce with the documented Python dependencies installed:

```sh
node demo/self-review-smoke.mjs
```

The script creates isolated temporary storage, generates the PDFs with
`scripts/render-mock-evidence.py`, prints an English JSON result with verbatim
source quotes, and removes its temporary files. Both API-key variables are blank
and live model calls are explicitly disabled in the test server.

These checks use deterministic extraction of supported text labels, not OCR or a
new LLM accuracy test. Certification date equality with the articles date is the
agreed demo rule, not a statement of official filing requirements. This evidence
is separate from the [recorded Haiku tests](../bench/review/haiku-live-results/README.md)
and [PDF pixel verification](VERIFICATION.md).
