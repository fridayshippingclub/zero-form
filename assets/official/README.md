# Official form sources used by the demonstration

Downloaded unchanged from the Ministry of Economic Affairs GCIS [limited-company forms index](https://gcis.nat.gov.tw/mainNew/subclassNAction.do?method=getFile&pk=49) on 2026-11-11. Exact download URLs and SHA-256 values are recorded in `sources.json`.

| Frontend document | Original source | Pages |
| --- | --- | --- |
| app | t70433: 有限公司設立（變更）登記申請書 | 2 |
| t70126 | 公司章程 | 3 |
| t70130 | 股東同意書, including official examples page | 2 |
| t70132 | 董事願任同意書, including original notes | 1 |
| t70124 | 使用同意書（範例） | 1 |
| t70135 | 有限公司設立登記表 | 3 |

The runtime uses these original PDF pages as backgrounds. It adds a small demonstration footer and fills selected existing blank regions using the native Rust/Typst pipeline and the confirmed semantic facts. Facts that do not fit an original blank or have no matching original field are placed on a separate, explicitly nonofficial confirmed-data appendix. All original pages, wording, notes and optional clauses remain present. This is a partial demonstration, not a legally complete filing package. Signatures, seals, unknown data and optional choices remain blank; no official endorsement is implied.

The preserved originals retain their embedded fonts. New data and demonstration text use the official open-licensed TW-Kai source; the native core receives a per-application subset named `Zero Form Kai Demo` to stay within its unchanged asset-size limit. Original source font and PDF files remain unchanged. Fictional external accountant/address/name evidence remains separate and is not represented as government-issued paperwork.
