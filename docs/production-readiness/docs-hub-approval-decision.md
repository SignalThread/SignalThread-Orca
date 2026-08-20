# Docs Hub Approval — Production UX Decision (Product Input Needed)

_Last reviewed: 2026-07-04. This is a decision record, not an implementation.
No code was changed._

## Current workflow (from source)

- **Backend is complete and auth-guarded.** Document review transitions exist as
  real routes and enforce event write access:
  - `POST /api/events/[eventId]/documents/[documentId]/review/submit`
  - `POST /api/events/[eventId]/documents/[documentId]/review/pull-back`
  - `POST /api/events/[eventId]/documents/[documentId]/approve`
  - `POST /api/events/[eventId]/documents/[documentId]/reject` (takes a `note`)
  - `POST /api/events/[eventId]/documents/[documentId]/reopen`
- **The planner UI can move a doc into review but cannot decide it in
  production.** In `web/app/(shell)/events/[eventId]/docs/_components/event-docs-page.tsx`,
  the only approve/reject controls are the "Simulate Approve" / "Simulate Reject"
  buttons, rendered behind `process.env.NODE_ENV !== "production"` (≈ line 1441)
  and calling `handleSimulateAction` (≈ line 686). In production they are hidden,
  so an `IN_REVIEW` document has no approve/reject affordance.

## The production gap

This is **not** a route-level 404 bug — the endpoints work and are guarded. It is
a missing/undecided production UI: who approves a document, and where? The
"Simulate" labeling signals the surface was a placeholder pending a product
decision.

## Options

- **A. Promote the planner approve/reject controls to real production UI.**
  Best if review is an **internal** step performed by planners/admins on the same
  event. Low effort: relabel (drop "Simulate"), remove the `NODE_ENV` gate, and
  restrict visibility to the appropriate role (approver ≠ submitter if desired).
- **B. Build a reviewer-facing approval surface.**
  Best if reviewers are **distinct** from planners (e.g. clients/approvers who may
  not have planner accounts) — likely a scoped, possibly token-based surface
  (comparable to the speaker portal) plus reviewer notification/recipient wiring.

## Recommendation

**Choose A as the MVP if the reviewer is an internal planner/admin role**; it
ships the already-built backend behind a clear, role-gated production UI with
minimal work. Move to B only if the product requires external/non-planner
reviewers. The deciding question for the product owner: *is document approval
done by someone with a planner account on this event, or by an outside party?*

Guardrails for whichever path (from the loop rules): do not ship buttons labeled
"Simulate" in production, and do not weaken the existing auth on the review
routes.

## If A is chosen — implementation prompt

1. Replace the dev-only "Simulate" block with production approve/reject controls
   for `IN_REVIEW` documents, visible only to the approver role.
2. Keep the reject-reason prompt; keep `reopen` for post-decision correction.
3. Confirm whether the approver must differ from the submitter; enforce
   server-side if so.
4. Tests: approver role can approve/reject/reopen; non-approver cannot; reject
   requires a note; status transitions and any activity/notification records are
   written; submitter-vs-approver rule (if adopted) is enforced.

## If B is chosen — feature-gap prompt

1. Define the reviewer identity model (planner role vs. scoped token) and
   notification recipients.
2. Build the reviewer surface (list of pending reviews, view, approve/reject with
   note) with its own access control.
3. Wire submit-for-review to notify the reviewer; wire decisions back to the
   planner view.
4. Tests: reviewer scope isolation, decision writes, notifications, and that
   planners see the outcome.

## Product decision needed

Confirm **A or B** (internal vs. external reviewer). Until then, leave the
production UI as-is (backend intact, dev-only controls hidden). No code change is
made by this record.
