# PREP-01 isolated package

`contracts.ts` and `repository.ts` are the synthetic contract/recovery harness, not public DTOs or the application worker. `schema.sql` is applied only by the disposable-schema test. No route imports this harness repository. The canonical public schema is `../preparation/protocol.ts`.

Sources and oracle are authored separately in `tests/fixtures/preparation-pilot/`. The deterministic builder creates 20 PDF versions (including two exact duplicate copies), scanned application/PFS, interactive certification field variants and 48-page reports with relevant details beyond page 12. `pages` in the fixture manifest is authored text, not OCR output. Real selective reading is tested separately against actual bytes.

Generate reviewable files without DB/network/provider access:

```sh
npx tsx scripts/materialize-prep01.ts /tmp/prep01-new-output
npx tsx --test tests/preparation-pilot.test.ts tests/preparation-reader.test.ts
npx tsx tests/preparation-pilot.integration.ts
npx tsx tests/preparation-runtime.integration.ts
```

The last two commands require local `DATABASE_URL` and create/drop only their own random schemas. Existing application schema/data are untouched. The oracle stays separate from provider input. C0–C5 readiness expectations remain future synthetic diagnostics: the current integrated release is document completeness only.

Evidence established: deterministic hashes, distinct corrections, locator assertions, complete six-request ledger, conservative source validation, durable restart/replay/lease/cancel/budget checks. Generated scan/application and blank/filled certification pages were visually inspected. Not established: semantic model accuracy, authentic signatures, independent bank/trust verification, appraisal acceptance, production parser isolation, live latency/cost, or automatic mapping quality. The initial mapping gate remains closed.
