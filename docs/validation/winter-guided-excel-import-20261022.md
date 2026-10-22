# Winter Excel import: guided review (2026-10-22)

## Scope

Based on `prep/winter-2026` at `12708d69d7685e430b7c546f619be9a8fcb61dcc`.
The organizer requested a flow understandable without an assistant: read the
application, review highlighted corrections, import, then open start lists and
settlement. Rendering remains in the shared master; Winter data and persistence
remain in the existing adapters. Autumn does not yet consume these Excel
components; this change does not claim a completed Autumn Excel migration.

## Behavior

- Four visible steps and a next-action prompt. Blocking issues link to their
  editable person, entry, amount, or payment field; advisory warnings stay distinct.
- Responsive review cards expose original Excel values and suggested existing
  identities. A candidate still requires explicit confirmation, including club.
- Reading Excel fetches existing roster and event data. Exact organization and
  participant matches show Winter registration immediately, including legacy event
  organizations. Similar spellings and duplicate clubs are blocked for resolution.
- Registered organizations require choosing initial/additional import or change/
  withdrawal. Initial/additional import uses the existing duplicate-aware service.
  Change/withdrawal saves the review locally and opens the existing administrative
  change flow. It does **not** automatically apply workbook revisions or delete
  entries omitted from a workbook. Comparison displays the candidate differences.
- New reviews receive `WINTER-2026-` plus 128 bits of the file digest. The same
  file bytes retain the same reference even after renaming; changed bytes receive
  a different reference. Existing saved references remain readable and unchanged.
- On the same browser/device, a known reference automatically reopens its stored
  registration checkpoint. Completion still requires a fresh authoritative read.
- The final summary distinguishes already-registered entries from new entries.
  Completion provides links to start lists and settlement. The separately confirmed
  payment remains a review record, never an automatic payment posting.
- Normal next-application navigation retains local records without requiring a
  JSON download. JSON tools remain under resume/export details for another device.
  Concurrent local record changes and storage failures still stop replacement.

## Validation

Passed locally:

- `tsc --noEmit` (separate check; the repository build configuration skips types).
- Draft, guide, review-component, registration-core, registration-component, and
  service-adapter test suites. Fixtures are synthetic and perform no real requests.
- New controller cases: registered-club purpose required at the actual save action;
  purpose changes invalidate confirmation; change navigation preserves local review;
  same-file automatic checkpoint reopening; advancing without a JSON download;
  local completion flags never substitute for server readback.
- Existing retry IDs, unknown-result handling, stop/resume, auth, fee, storage,
  event isolation, stale-checkpoint, and duplicate-registration tests remain passing.
- `next build --webpack`: all 24 pages generated. Default local Turbopack rejects
  this worktree's external `node_modules` symlink; no application configuration was
  changed to accommodate that local environment limitation.

No real workbook registration, payment posting, database migration, permission
change, production promotion, or Autumn deployment is part of this validation.
The organizer will reload a real application in the preview to verify usability.
Production data and applicant screenshots are not included in this change.

## Follow-up: settlement organization list

During the organizer's preview test, the organization list showed zero after an
Excel import. Source inspection found that the list rendered only `extraTotal`
(reception additions/changes). Excel entries use the initial-entry ledger, which
is included by the existing settlement account calculation in `normalTotal` and
`total`, but was omitted from the list's displayed amount.

The shared list now accepts optional balance data. Winter supplies the same
account totals used by its detail view: total charges, recorded payments, and
remaining balance. Account warnings appear next to the organization. Autumn's
existing adapter and rendered markup remain unchanged. This is a presentation
fix; no fee calculation, registration, payment, API or database code was changed.

Synthetic rendering tests exercise the actual Winter adapter and account
calculator: three initial entries totaling 31,000 and one participating horse
produce 45,000 in charges even with zero reception surcharges. Unrecorded,
partial, full and excess payments show their respective balances. Missing-fee
warnings remain visible. The existing exact-HTML Autumn regression check passes.
These figures are synthetic test expectations, not a verification of a real
organization's database balance.

Follow-up checks passed: `tsc --noEmit`, `tests/winter-settlement.cjs`,
`tests/master-admin-settlement.cjs`, `git diff --check`, and
`next build --webpack` (24 pages). No authenticated browser or live balance query
was available in this follow-up; verification covers source and synthetic data.
