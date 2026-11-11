# Agent API (local demonstration)

The agent reads the same schema, semantic role bindings and signed application as the human UI. This is a single-user local demo, with simulated identity/registry checks; it is not an authenticated production review service.

```sh
curl http://localhost:5173/api/agent/schema
curl http://localhost:5173/api/agent/review
```

`GET /api/agent/schema` returns field definitions, applicant/representative/director bindings to the same person entity, expanded per-form bindings, computed input/placement/document counts, missing draft fields, and endpoint links.

`GET /api/agent/review` returns `404` until a signed snapshot exists. Its `mode` is `demo_only`. It includes the signed application ID/version/hash, current evidence revision, data/provenance, six generated PDF hashes/URLs and role bindings, uploaded PDF observations with page-one source links, verification checks and recommendation. Certification date references the uploaded report and declared articles date; the separate articles-before-application rule references both declared dates.

Generated documents have `source: generated` and `confidence: verified_render` when their stored native-core output digest still matches. Their bindings describe confirmed inputs; they are **not independently extracted observed text**. Uploaded attachment observations come from the PDF parser, not the fixture catalog. A recommendation of `approve` does not set a human decision: `decision` remains `null` until the officer acts in the UI.

Document URLs include `snapshotHash`; a different application or version at the same numeric URL returns `409` when the supplied hash does not match. Clients should preserve the complete returned URL. No local filesystem paths are exposed by these agent endpoints.

Agents can populate a draft through the existing endpoint after the applicant starts a session:

```sh
curl -X POST http://localhost:5173/api/agent/draft \
  -H 'Content-Type: application/json' \
  -d '{"values":{"company.capital":"10000"}}'
```

Human confirmation/signing and the officer decision remain in the existing UI; no agent approval mutation endpoint is provided. Run the isolated full happy-path smoke with `node demo/agent-review-smoke.mjs`.
