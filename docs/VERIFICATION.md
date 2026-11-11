# Pixel Perfect Preservation

**PASS. Zero protected pixels changed at 144 DPI and 288 DPI.**

A fresh run on 11 November 2026 generated **6 PDFs, 18 pages and 35 field placements** using synthetic incorporation data. The verifier compared every page at both resolutions, for 36 page and resolution comparisons.

| Generated document | Pages | Fields checked | Changed pixels at 144 DPI | Changed pixels at 288 DPI |
| --- | ---: | ---: | ---: | ---: |
| Company incorporation application | 3 | 6 | 0 | 0 |
| Articles of incorporation | 4 | 7 | 0 | 0 |
| Shareholder consent | 3 | 4 | 0 | 0 |
| Director consent | 2 | 3 | 0 | 0 |
| Building owner consent | 2 | 4 | 0 | 0 |
| Company registration form | 4 | 11 | 0 | 0 |
| **Total** | **18** | **35** | **0** | **0** |

For each resolution, Poppler rasterized the prepared template and the filled PDF. The verifier required exact RGB equality outside the designated fill rectangles. Page count, dimensions and field text readback also passed.

The baseline includes the demo footer and any supplemental page before filling. Of the 35 placements, 14 are on official form pages and 21 are on supplemental pages.

[Raw verification log with PDF hashes](../bench/review/pixel-verification.json) · [Official form sources](../assets/official/README.md)

Render environment used Typst 0.15.1, Poppler 26.05.0 and pypdf 6.21.4.
