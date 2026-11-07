# Proximitty UX plan

Audit date: November 6, 2026. Scope: simplicity and usability across M1 manual portals, M2 optional AI, and M3 persistent human communication. This is an internal expert review and proposed interaction design, not external user validation or a claim of milestone completion.

## Basis and verification limits

Read `AGENTS.md` and `REQUIREMENTS.md` v0.3, especially sections 5.1–5.2 and milestone exits. Inspected `app/page.tsx`, `app/globals.css`, `app/lender/page.tsx`, `app/lender/review/page.tsx`, `app/lender/use-application.ts`, `app/lender/layout.tsx`, `app/lender/lender.css`, `lib/model.ts`, and `lib/review-state.ts`. Reviewed all four existing screenshots: `artifacts/borrower-simple.jpg`, `artifacts/lender-simple.jpg`, `artifacts/portal-desktop.jpg`, and `artifacts/lender-portal.jpg`.

Read-only live inspection on the existing server at `http://127.0.0.1:3000` confirmed the borrower checklist, opening/cancelling the upload dialog, and lender document-review controls. The live fixture showed two requests with files and a lender change request on operating statements. Did not upload, save reviews, change fixture data, restart servers, or test authentication. Screenshot fixture counts differ from the live data; screenshots are visual references, not proof of current workflow state. Source inspection establishes intended code behavior, not successful end-to-end persistence. Keyboard completion, 200% zoom, measured contrast, restart recovery, and actual participant usability remain to be tested.

Only this Markdown deliverable was authored for this assignment. No implementation changes, new test infrastructure, hosting, workers, or OCR are proposed here. The PostgreSQL/Docker/Better Auth/private-file target remains governed by REQUIREMENTS.md; current screens explicitly disclose a local unauthenticated demo.

## What is already useful

- The simplified screenshots remove the older dashboard tiles and borrower sidebar. Keep that calm direction; one application does not need a dashboard.
- Borrower requests have visible periods and text status; lender feedback appears beside the relevant request. Application detail and file lists use disclosures.
- Upload has a labeled picker, format/size guidance, progress, server-save feedback, actionable failure copy, and focus restoration in source. A transfer reaching 100% is followed by “Validating and saving…” rather than immediate success.
- Lender review focuses on files with “Accept documents” and “Ask for changes.” Internal notes are explicitly private to lenders. Review history is available on demand.
- Lender draft text is kept in browser storage and failed saves preserve it in source. Review validity compares reviewed file IDs with current file IDs, so adding files does not silently inherit acceptance.

These foundations should survive the milestone work. Their existence does not compensate for the missing complete collection/submission/review cycle.

## Prioritized M1 audit

P0 means a core M1 journey cannot be completed or its meaning is misleading. P1 means a required usability defect to fix before M1 exit. P2 is refinement after the full cycle works.

| Priority | Verified observation | User consequence | Concrete recommendation and acceptance evidence |
|---|---|---|---|
| P0 | Borrower screen has upload/download but no submission summary, confirmation, receipt, or resubmission. `ApplicationSnapshot` has no submission record. | A borrower cannot know when they have actually sent a package. | Build review → explicit send → dated receipt, then revised submission. Demonstrate unchanged earlier receipt contents after replacement. |
| P0 | Upload success says “provided, pending lender review”; `reviewState` calls any unreviewed files “Ready to review.” | Uploading and sending are conflated. | Use the state vocabulary below. Lender review identifies the submitted version; any draft visibility is explicitly labeled. Show “Not yet sent” before submission. |
| P0 | “Add file” is the only borrower action after upload; all mapped documents become current files. | A correction accumulates files without establishing which replaces which. | Offer “Replace file” alongside quieter “Add another file.” Keep superseded files under “Previous files,” with current version explicit. Preserve all submitted versions. |
| P0 | No borrower explanation/correction form, manual-fact confirmation, or explained-missing-item submission path in the inspected screen. | Users who cannot supply an item have no way forward; manual rules cannot be made understandable. | Add a structured response on request detail: “I cannot provide this yet” / “Add an explanation”; optional targeted fact fields only when relevant. Show saved draft and include unresolved explanation in send review. |
| P0 | Lender review offers acceptance/change request, but no add-request or waiver control. | Lender cannot perform the required M1 review cycle. | Add “Add document request”; secondary “Waive this request” requires a reason and consequence confirmation. Borrower sees the reason after refresh. |
| P1 | Default borrower filter is “All requests”; purpose is inside “Details & files.” The simplified 1280×720 screenshot only reaches the first request near its bottom. | Existing work and repeated headers consume attention before the next task; users must expand to learn why a document is needed. | Default to “Needs attention,” show one-sentence purpose beside period, and reduce repeated headings/counters. Keep uploaded items and full checklist one clearly labeled action away. |
| P1 | Global upload defaults silently to the first request, “Current rent roll,” even when it already has a file. | An unfamiliar user may attach another document to the wrong request. | Prefer request-specific upload. General upload starts “Choose the request this file is for”; never silently classify. Show mapping before save and allow correction afterward. |
| P1 | Mapping UI supports one request selection even though document data contains multiple requirement IDs. | A file satisfying two requests may be unnecessarily uploaded twice. | On request detail offer “Use an uploaded file”; secondary mapping editor allows explicit additional request links without another upload. |
| P1 | Lender default selects the first request; application-list badge falls back to “Collecting documents” whenever no file needs review, including an all-accepted state. | Reviewers can start on an irrelevant item or see misleading application progress. | Open the next submitted item requiring review; give explicit empty/accepted/awaiting-borrower states. Keep collection, submission, and evidence acceptance distinct. |
| P1 | Several active CSS rules use 13–15px for feedback, periods, help, filters, status and file detail; some mobile controls shrink further. | Essential instructions are harder to read precisely where users need confidence. | Make task text, periods, feedback, errors, labels and status at least 16px; primary targets at least 44×44px. Test rendered sizes, focus, contrast and 200% zoom rather than inferring from large headings. |
| P1 | LOI reference exists in the model but is not displayed in borrower application details; lender contact and correction request are absent there. | Users lack agreed context and a route to correct the application. | Add “Letter of intent,” lender identity/contact information when configured, and “Request a correction” with structured saved explanation. Do not imply M3 chat is available. |
| P1 | Lender drafts use global browser keys; borrower explanations do not yet exist. | Future authenticated/shared-device use could restore another account/application’s draft; users cannot trust recovery. | Scope drafts by user, application and request; prefer server-backed authenticated text drafts. Never restore another account’s text. Clearly label local-only recovery if retained temporarily. |
| P1 | Source exposes refresh on error but no normal “Check for updates” control. | Borrowers may wait for feedback without knowing a refresh is needed. | Show last checked time and a quiet “Check for updates” action. Refresh the relevant list after successful writes. Do not promise push notifications. |
| P2 | “Stored, not analyzed,” “provided,” “Uploaded files” and “Uploaded documents” overlap; “Opening…” is used for lender download progress. | Vocabulary adds avoidable interpretation. | Standardize to “Uploaded documents,” “Downloading…,” and state-specific copy below; disclose manual review once instead of repeating processing internals per file. |

Format note: current upload UI accepts JPG/PNG/WebP in addition to PDF/XLSX/CSV. REQUIREMENTS.md establishes the latter baseline and leaves image expansion provisional. Reconcile this scope explicitly; do not advertise image analysis merely because image storage exists.

## State vocabulary and trust

Treat file, request and package states as related but separate. A single green check cannot mean all three.

| Visible label | Meaning and next action |
|---|---|
| Needed | No current evidence or saved explanation. “Upload [document]” is the next action. |
| Uploading… / Saving… | Transfer/server save is in progress. No success or received status yet. |
| Uploaded · Not yet sent | File and metadata were saved. “Review and send” is available; this is not lender acceptance. |
| Explanation saved · Not yet sent | Text is saved with a named unresolved request. Still visible under attention; not counted as accepted evidence. |
| Waiting for lender review | The current evidence/explanation was included in a successful submission. Show sent date and package version. |
| Change requested | A lender has asked for a specific correction. Keep their message, requested period, and action visible. |
| Updated · Not yet sent | A new file or response follows an earlier submission. The lender’s earlier decision remains attached to the earlier version. |
| Accepted by lender | Explicit evidence acceptance for identified current versions. It does not mean loan approval. |
| Waived by lender | Lender waived the requirement with a reason; retain the reason and history. It is not an upload or acceptance. |

Show brief factual progress: “3 requests need your attention. 2 are waiting for lender review.” Avoid a single “100% complete” indicator based on files present. If a new request appears, explain “Your lender added 1 request”; preserve the visible record of completed work.

If the lender can inspect drafts before submission, label that section “Uploaded draft — borrower has not sent this version.” Recommend formal review actions target the submitted package so a concurrent borrower edit cannot change the object being accepted. Any alternate early-review policy needs an explicit product decision and equally clear version labeling.

## Concrete M1 screen design

### Borrower overview

Use property name as the main heading, borrower name directly below, then a compact progress sentence. Keep “Application details” for address, amount, transaction, LOI, contact and correction action. Use a stable documents area rather than a permanent chat or analytics sidebar.

First show change requests, then new/unprovided items. Each row contains title, one-sentence purpose, required period, text status, and one specific next action. Example: “Current rent roll — Shows tenants, rents and vacant units. Required date: [configured date]. Upload rent roll.” A default example is not a silently inferred lending policy. Keep “View all requests” and “Uploaded documents” visible and quiet. Within uploaded items retain “Waiting for lender review,” “Accepted by lender” and “Waived by lender” distinctions.

Use one dominant page action based on stage: “Continue documents” when work remains, “Review and send” when reviewing a draft, “Review and send updates” after follow-up. Row actions are secondary visual weight. Review is available with unresolved items; explain what must be acknowledged instead of disabling it without a reason.

### Request detail and upload

Keep request title, purpose, period and lender feedback above the file area. Request-specific upload automatically carries the correct mapping and displays “For: Current rent roll.” The picker uses “Choose file,” displays supported formats and 25 MB limit beforehand, and shows chosen filename plus “Upload file.” Do not require drag-and-drop or financial data transcription.

Successful copy: “rent-roll.csv uploaded. It has not been sent to your lender yet.” Follow with “Add another file” and “Back to documents.” Do not imply the file was analyzed. Show transfer and durable save separately; retain the selected file after a recoverable in-session failure. After a reload, explain that unsaved file selection must be chosen again; do not promise browsers can recover file bytes.

Below current files provide “Replace file,” “Use an uploaded file,” and “Add an explanation.” Text has a persistent label, saving/saved state and recovery message. Manual facts should be specific optional inputs such as “Reporting date” with “I don’t know”; reuse information already entered. Show a rule-generated request’s reason and confirmed input, with its evidence on demand. Missing values must not look like passing checks.

Previous files and review history are collapsed, with dated versions and download actions. Replacement confirmation is inline: “This becomes the current file. Earlier submitted versions remain in Previous files.” Do not add a modal confirmation to every upload.

Error examples: “This file is larger than 25 MB. Choose a smaller file.” “Your upload may have finished. Check Uploaded documents before trying again.” “We could not save your explanation. Your text is still here. Try again.” For duplicates, identify the existing file and offer linking it to this request rather than telling the user to rename it.

### Review, send and receipt

Heading: “Review before sending.” Summarize current documents, explanations, changed items and missing requests. Keep exceptions visible, with links back to fix each one. Acknowledgment: “I understand these items are still unresolved and will be included for lender review.” Describe lender review accurately; no credit-decision implication.

The review screen itself is the consequential confirmation: “Send to lender” commits the displayed package. Prevent duplicate sends while pending. Success screen: “Documents sent,” exact date/time with timezone, package version, document list and unresolved explanations. “Your lender will review this package. This is not loan approval.” Link to “View documents sent” and “Back to documents.” Do not invent a response deadline.

After ambiguous failure, check submission history before retrying; do not create a second receipt blindly. Preserve the draft on an ordinary failure. A later upload creates an editable revision with “Updates not yet sent”; the earlier receipt must still show exactly what was sent then.

### Lender list and review

Keep the simple application list. Each row shows property, borrower, review state and sent/updated date with “Review application.” Loan amount can remain secondary; remove duplicate summary counters. Distinguish “New submission,” “Updated submission,” “Waiting for borrower,” and “All submitted requests reviewed” without equating the last with loan approval.

Review opens the next submitted request needing a decision. On wide screens keep a modest request list beside evidence; on narrow screens use a full-width list/detail sequence and “Back to requests,” avoiding a tiny nested scrolling list above the task. Show package version, current documents, borrower explanations, period and any unresolved issue before decision controls.

“Accept documents” is dominant until “Request a change” opens a response form; then “Send change request” is dominant and acceptance is visually quieter. Use a persistent “What needs to change?” label and a concrete example. Confirm success: “Change request saved. The borrower can see it after refreshing.” Preserve the text if saving fails or a concurrent update requires refresh. Do not silently overwrite another reviewer’s decision.

“Add document request” opens a short form for name, purpose, period, responsible party and relevant category, with a borrower-facing preview. Secondary “Waive this request” requires a reason and confirmation: “The borrower will no longer need to supply this item. This does not approve the loan.” Record waiver separately from acceptance. Internal notes must stay unmistakably separate from messages shown to borrowers.

### Sign-in and recovery

Better Auth introduces a small sign-in screen with persistent email/password labels, “Sign in,” visible errors and a password visibility control. Use only recovery routes actually implemented; hide unavailable controls. On session expiry preserve authorized drafts, explain “Sign in again to continue,” and return to the same application/request. Replace demo role-switch links with correct signed-in identity and sign-out. Demo fixtures remain clearly labeled. Never promise a draft is saved across devices unless server persistence supports it.

## M2 interaction guidance

- Keep the full M1 layout and manual actions. Add a quiet application-level “AI assistance: Off” control. Before opt-in explain the actual supported processing scope and external provider handling using verified configuration/policy, without provider setup or model jargon in the normal workflow.
- Upload always completes first. A supported file offers explicit “Analyze document”; unsupported analysis says “This file is saved. Review it manually.” No automatic chat panel or automatic reprocessing after enabling AI.
- Separate “Uploaded” from “Analysis in progress,” “Suggestions ready,” and “Analysis could not finish.” Persist interrupted status and offer “Try analysis again” plus the working manual path. Do not show fabricated percentage progress.
- A suggestion states proposed value, source file/version, uncertainty when applicable and practical consequence. Example: “Suggested reporting date: [date]. Confirm this date to check whether a newer rent roll is needed.” “View source” opens the actual page/row reference; never invent one.
- Provide “Confirm,” “Correct,” and “Explain why you disagree.” Record disagreement as a borrower assertion for lender review, retain original evidence, and stop repeated demands on unchanged evidence. Borrower disagreement never displays “Accepted by lender.”
- For conditional requests show “Why this was added” with the confirmed fact and source. Corrections can supersede the old request while retaining history; do not erase completed work or silently add duplicate requests.
- When switched off: “AI assistance is off. No new analysis will start. Processing already started may not be retractable.” Prevent late results from changing the checklist. Historical suggestions remain labeled. Manual rules remain available on confirmed inputs and are explained as checks, not AI.
- Before M3, “Include for lender review” records an exception in the normal submission. Do not expose a nonfunctional “Ask a person” conversation action or imply a message was sent.

## M3 interaction guidance

Use the familiar visible label “Ask a person” at application/request level and on findings, even with AI off. The underlying record can be an escalation; borrowers need not learn that word.

Open a short form with selected request/context, a reason selector and “What would you like help with?” Only ask for information not already present. Preview the specific file version/finding attached; do not expose unrelated guarantor material. Show the actual assigned reviewer or “Lender team” when a real authorized queue exists. If routing is unavailable, report failure and preserve the draft rather than claiming delivery.

“Send question” produces a persisted message and confirmation: “Question sent to [recipient]. Replies appear here. Use Check for updates to see new replies.” No live presence, typing animation, email delivery implication or response-time promise. Label sender identity, human role and time clearly; keep AI content separate from this conversation.

A small Messages destination or contextual thread link is sufficient. New replies are visible on the application and relevant request without opening conversation automatically. Lender inbox entries show borrower, property, request, last message and status, then open context plus conversation. Draft replies survive request navigation and recoverable failures; show “Sending…” until persisted and prevent retry duplicates.

Use Open, In progress and Resolved with plain explanations. Resolution requires a lender explanation. Display “Conversation resolved. Document request status is unchanged” unless a separate explicit review action changed it. Replying to a resolved thread reopens it visibly. Conversations supplement the checklist; uploading, explaining and submitting must still work independently.

## Uncoached usability walkthrough and release evidence

This is a protocol ready to run, not a completed participant study. Recruit a representative person around age 60 or an unfamiliar user; account for varied vision, motor confidence and software experience without assuming inability. If unavailable, label results “internal walkthrough.” Use only synthetic data in separate borrower/lender accounts. Prepare resettable fixtures without changing shared active data during this audit.

Tell the participant: “You are collecting documents for this property loan. Use the site as you normally would. Tell us what you think is happening.” Give one outcome prompt at a time, not button names or click instructions. Do not rescue navigation; record a blockage before offering help. Ask the participant to explain state in their own words.

| Task prompt | Observe without coaching | Pass evidence |
|---|---|---|
| “Find what your lender needs next and why.” | First action, ability to locate period/purpose, unnecessary searching. | Identifies the correct outstanding request and next action. |
| “Provide this rent roll from your computer.” | Picker discovery, mapping, chosen-file confirmation, save feedback. | Correct file/request saved; participant can say it is uploaded but not yet sent. |
| “You also have one file covering two requests.” | Whether participant reuploads or finds existing-file linking. | Both mappings are clear; no duplicate bytes required. |
| “You cannot obtain this statement yet. Explain the situation and come back later.” | Explanation discovery and save-state comprehension; reload. | Text returns with correct account/request and remains unresolved, not accepted. |
| “Send what you have, including the missing statement.” | Exception acknowledgment, consequence understanding, final action. | Receipt identifies package/date and unresolved item; participant knows it awaits review. |
| Lender: “Find this new package and decide whether the rent roll answers the request.” | Opening evidence, locating explanation/version, decision controls. | Explicit acceptance or specific change request saved against reviewed evidence. |
| Lender: “Request an additional document; remove another requirement with a reason.” | Add-request fields and waiver consequences. | Borrower sees correct period/purpose and waiver reason after refresh. |
| Borrower: “Your lender needs a newer rent roll. Respond.” | Feedback discovery, replacing rather than accumulating, resubmission. | New current version sent; earlier package and feedback remain traceable. |
| “The connection failed while saving. Continue your work.” | Error/action clarity, draft retention, duplicate handling. | Recovers without retyping saved text or duplicating a submission. |
| M2: “Check the suggested date. It is wrong. Continue without AI.” | Recognizes suggestion/source; correction/disagreement; off state. | Manual path works, historical suggestion is distinguishable, no repeated blocking on unchanged evidence. |
| M3: “Ask a person about this request and find their reply.” | Discovery, recipient/context, sent status, human identity. | Both parties see persisted exchange; reply to resolved conversation reopens it without automatic acceptance. |

Repeat essential upload, review and submit controls with keyboard only and at 200% browser zoom. Check focus placement/restoration, dialog exit, visible focus, readable status, wrapping of long filenames and messages, and absence of main-workflow horizontal scrolling. Inspect computed task text sizes and target dimensions; measure contrast rather than declaring compliance from screenshots. Confirm status remains understandable without color. Keep current context visible on small screens and avoid sticky controls covering content.

For each run record build/date, fixture, participant type (external/internal), task outcome, observed words/confusion, help required, recovery result, defect and retest outcome. Record time if useful for comparison, but do not invent a universal speed threshold. Any coached core action, repeated uploaded/sent/accepted confusion, lost draft, or inaccessible required control is a milestone UX defect. Mark unrun scenarios “not tested,” never “passed.”

## Implementation order and handoff

1. Agree and implement the file/request/submission state distinctions with immutable version semantics. Build the full M1 submission and follow-up loop before decorative polish.
2. Complete borrower explanations, manual mapping/replacement, lender request creation/waivers and correct authenticated draft recovery.
3. Apply attention-first layout, consistent copy, readable task text, normal refresh and keyboard/zoom fixes across both portals.
4. Run and record the M1 walkthrough alongside existing project checks. A documentation-only audit does not require a new test framework or imply checks were run.
5. Add M2 suggestions and M3 human conversation incrementally, rerunning manual parity and the relevant uncoached tasks at each milestone.

Open decisions to carry to the coordinator: pre-submission lender visibility/action policy; configured periods and conditional-rule policy; image upload scope; actual recipient/queue behavior for M3; verified AI consent wording. These do not block implementing the already-required manual cycle. REQUIREMENTS.md remains the source of truth if details here need reconciliation.
