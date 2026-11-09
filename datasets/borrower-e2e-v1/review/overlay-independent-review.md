# Independent development-overlay review

Reviewer: `/root/independent_review`, separate from the author. Scope: four development overlays and the offline authorization, scoring, generation and export tools. No provider, runtime, database or UI execution was performed. No corpus PDF or frozen holdout was edited by this reviewer.

## Semantic review

- **DEV-HISTORY (D02):** Active previously saved annual, July and complete August evidence can satisfy requests while an inactive superseded partial August copy cannot. The new roll must not erase earlier support. A later renamed July duplicate does not supply a missing month. Entity documents arrive last. The expected met/unmet/unknown criteria are consistent with those inventory transitions.
- **DEV-BUDGET (D06):** Lease identification is not execution evidence. During the limit, lease/roll and operating comparison remain unknown, while independent supported criteria remain met. Operator-owned continuation preserves observations and cumulative spending. Late lease pages 31–32 support the final findings. These are authored test ledger amounts, not approval to incur costs.
- **DEV-UPLOAD-RACE (D07):** The obscured copy stays active until the clear upload is saved. Pending file metadata is not readable evidence. After save, independent evidence is retained while the clear lease remains unchecked. A revision-2 result cannot publish as current after revision 4. The final result cites the clear current copy, not the superseded obstruction.
- **DEV-DIALOGUE (D03):** Initial rent discrepancy warrants focused clarification without deciding which document is wrong. A vague answer does not replace the amendment. Saving the amendment is not the same as inspecting it; its chain/comparison criteria remain unknown at that boundary. Once inspected, the effective date reconciles current rent and YTD. Every additional spontaneous response must remain in the trusted transcript and be reviewed.

No new PDF evidence was authored. The overlay source-document bindings reuse previously independently reviewed development bytes. Holdout remains outside overlay scope. The canonical 12-case review is unchanged; these overlays add distinct lifecycle and conversational checks rather than replace canonical checkpoints.

## Review findings

1. Initially only reported mutations were checked, so omitted trusted committed events could disappear. Corrected by reconciling trusted committed event inventory with the normalized trace, including prohibited hidden actions.
2. Overlay unmet findings initially omitted the core full active-page absence rule. Corrected; the negative coverage mutant now fails. Budget baselines still do not pretend execution pages were read before the final boundary.
3. A changed message with an unreviewed approval suffix initially returned `reviewComplete=true`. Corrected with full-message hash, independent all-claims-reviewed attestation, exact span offsets and coverage of non-whitespace characters. Partial/changed review mutants now leave review pending. This checks review completeness, not whether a reviewer correctly judged the semantics.
4. Action case/boundary scope was initially missing. The scorer now binds reported events to a case, boundary, active document and hash. Event/grant/confirmation fields, role, allowed operation, revocation/expiry and prior explicit confirmation are independently checked against trusted data.
5. Source bindings initially were recorded but not enforced by the load/export path. Final disposition below records whether fail-closed digest checks have been added and reverified.
6. Budget partial and final results initially used the same result revision despite changed findings at one evidence revision. Final disposition below records corrected result/evidence revision separation.
7. Action evidence revision must match the trusted overlay boundary, not merely an internally consistent stale grant. Final disposition below records this check.

## Interpretation boundaries

The audit ledger must be supplied by a trusted execution adapter, independently of the evaluated agent. The reviewer annotations must also be supplied outside agent context. These scripts cannot make an untrusted ledger or fabricated reviewer identity trustworthy. Shape checks, quote existence, source-page groups and complete annotation spans do not establish semantic entailment. The synthetic baseline labels itself authored test data; its passing review fields are not an independently reviewed borrower transcript. `mvpPassed` remains null.

The scripts exercise expected lifecycle observations and mutation authorization offline. They do not demonstrate that the deployed worker rejects stale commits, that a provider respects limits, or that users experience a successful upload. A future authorized runner must obtain those logs from actual execution, validate public contracts and collect independent semantic judgments before claiming an agent evaluation result.

Independent execution during review: 47 tests passed (29 overlay/authorization, 15 canonical scorer, 3 canonical export). Additional independently constructed DEV-HISTORY probes verified valid `upload_save`, `mapping_proposal`, and `confirmed_mapping` events pass when their trusted case/boundary/document/hash/revision and grants agree. Changing all event/grant/proposal/confirmation revisions together to stale revision 3 at revision 4 was rejected as critical for each action kind. All 12 original admitted manifests/oracles, 121 PDF hashes and the exact frozen-holdout manifest digest were independently compared to prior admission records and remained unchanged.


## Final disposition

**ADMITTED for offline development evaluation:** DEV-HISTORY (3 boundaries), DEV-BUDGET (4), DEV-UPLOAD-RACE (5), DEV-DIALOGUE (6). This admits the 18 authored boundary definitions and the reviewed offline scorer behavior, not an agent execution or deployed capability. Generated definitions may retain their authoring `provisional` label; the separate pinned `overlay-admission.json` is the independent review disposition.

Source/oracle digest checks now fail closed in overlay load; export invokes that check and validates exact case, evidence revision, active/inactive partitions and pending IDs. Budget final result revision advances to 2 while evidence remains at revision 1. Event evidence revisions are bound to trusted boundary/checkpoint revisions. Newly added gap expectations were reviewed: the upload-race gaps are unreadable only while the obscured copy is active; after the clear copy saves, gaps indicate pending investigation with operator ownership, not unreadability.

The final independent rerun passed **50/50 tests**: 32 overlay/authorization tests, 15 canonical scorer tests and 3 canonical export tests. Confirmed negative mutants include hidden unauthorized actions, stale grants, wrong scope/checkpoint, missing/expired/revoked grants, missing confirmation, false completion during budget/upload interruption, spent-ledger resets, lost/changed/restarted observations, stale result publication, inactive citations, incomplete clarification treated as evidence, omitted intermediate replies, critical interim claims, stale/partial message reviews, and unsupported absence. Pending-upload bytes remain excluded from exports. All 121 source PDFs and canonical/holdout admission hashes remained unchanged.

Independent semantic review remains required for future actual traces. The scripts verify trusted ledger coherence and review coverage, not reviewer identity, source authenticity or the correctness of an externally supplied semantic judgment. No model performance conclusion or automatic-linking authorization follows from this admission.
