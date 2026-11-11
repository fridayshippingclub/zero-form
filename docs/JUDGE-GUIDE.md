# Zero Form · English demo guide

Enter shared facts once to fill six incorporation forms. Upload the three external PDFs separately. Haiku identifies values in unfamiliar text layouts and points to the source page. Application rules compare those values with the draft. The applicant resolves missing or inconsistent evidence before signing, and a human reviewer makes the final demo decision.

## Demo walkthrough

1. Confirm the prefilled details and answer the three questions about the registered address, capital and building owner.
2. Upload the capital audit report, premises precheck and name reservation notice. Use the [three sample PDFs and matching answers](../bench/review/demo-uploads/README.md) or download samples in the local rehearsal at `/?demo=1`.
3. Select **Run self-review**. Compare the application value, the extracted value and the quoted source. A mismatch such as TWD 10,000,000 declared versus TWD 1,000,000 in the report blocks signing.
4. Replace the inconsistent evidence and run the review again. **Sign & submit** uses a demo confirmation code and generates six PDFs. The **Officer console** shows the package and its evidence checks.

## Document names

| Chinese title | English reading guide | How it enters the demo |
| --- | --- | --- |
| 公司設立登記申請書 | Company incorporation application | Generated |
| 公司章程 | Articles of incorporation | Generated |
| 股東同意書 | Shareholder consent | Generated |
| 董事願任同意書 | Director consent to serve | Generated |
| 建物所有權人同意書 | Building owner consent | Generated |
| 設立登記表 | Company registration form | Generated |
| 資本查核報告書 | Capital audit report | Uploaded by the applicant |
| 地址預查／營業場所預查 | Premises precheck | Uploaded by the applicant |
| 公司名稱及所營事業登記預查核定書 | Company name and business activities reservation notice | Uploaded by the applicant |

**Common fields.** 公司名稱 means company name, 預查編號 means name reservation number, 公司所在地 means registered address, 資本額 means capital, 所營事業 means business activities, 章程訂立日期 means articles date, 查核簽證日期 means certification date, and 申請日期 means application date. 申請人 is the applicant, 負責人 is the representative, 董事 is the director, and 建物所有權人 is the building owner. The PDF samples retain their Chinese form text and demo markings.

## Results

- **Live extraction.** Haiku 5.5 found the expected company, capital and certification date in four synthetic text PDFs across three layouts. It located a value on page two and preserved a mismatching amount for the rules to flag. [Live extraction results](../bench/review/haiku-live-results/README.md)
- **Cross-validation.** Four separate upload tests blocked signing for an address, name, capital or certification date mismatch. Missing evidence and unreadable text also block signing. [Upload test results](SEMANTIC-VERIFICATION.md)
- **PDF preservation.** Six generated PDFs passed exact pixel comparisons outside fill regions at 144 and 288 DPI. [Pixel verification results](VERIFICATION.md)

The demo uses synthetic evidence and a simulated confirmation code. It demonstrates document preparation and review readiness. Official filing, identity verification and scanned-image OCR are outside the demo.
