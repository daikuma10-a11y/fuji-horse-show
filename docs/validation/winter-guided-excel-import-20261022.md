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

## Follow-up: organization registration overview

The organizer requested a settlement-style organization selector inside
pre-registration for inspecting saved people, horses and entries after Excel
import. A fourth optional section, `団体別の登録内容`, now opens a club list and
read-only detail. The detail includes participating riders and horses, JEF
numbers, affiliations, entry counts, and entries ordered by date and competition
with start order, OP and withdrawal status. A horse without entries remains
visible. Saved earlier/manual registrations and Excel imports appear together;
an unsaved workbook draft is not treated as a completed registration.

The Winter adapter projects the dashboard's existing event-scoped snapshot.
Exact IDs preserve same-name identities and other-club riders. It uses each
entry's recorded organization, with the established horse-organization fallback
for legacy entries. Withdrawn entries remain visible but are excluded from
active counts. Loading and errors hide stale details. The selected club survives
ordinary data refreshes, and switching sections keeps existing form inputs
mounted. `/winter/admin#winter-registration-overview` opens the section directly.

Rendering and neutral types are in the shared master. The section is optional:
the existing two- and three-section contracts remain intact, and Autumn does not
yet consume this overview. No additional API, database, registration, payment,
permission or storage operation was introduced.

Synthetic checks cover club isolation, same-name IDs, cross-club affiliations,
unentered horses, date/competition ordering, OP, withdrawal, empty/error/loading
states, club selection/back navigation, event/reference guards and unchanged
source data. Dashboard integration checks cover the deep link, section selection
and preserved Excel form. `tests/winter-registration-overview.cjs`,
`tests/winter-preregistration-components.cjs`, `tests/master-admin-settlement.cjs`
and `tsc --noEmit` pass. `next build --webpack` generates all 24 pages, and
`git diff --check` passes. The settlement suite also verifies unchanged Autumn
rendering. Authenticated browser inspection is not available for this addition;
the organizer can review the new section in the dedicated Winter preview.

## Follow-up: rider qualifications and horse grade declarations

The club detail now has `所有資格級` in the rider roster and `グレード宣言` in
the horse roster. A separate read-only loader runs only while the overview is
open, using the existing administrator session and bounded GET queries for the
current Winter participants. It selects only the number, grade and import date
from the existing JEF master tables. The latest record for an exact JEF number
is used; conflicting same-date records and missing/blank data remain unconfirmed.
No identity is matched by name, and no grade is inferred from entered classes.

When the JEF rider master has no record, an existing Winter ID bridge may supply
the rider's historical `autumn_player` source grade. This is explicitly labeled
`過去原本（Autumn・要確認）`, not treated as current JEF verification. Multiple
conflicting source grades remain unresolved. Loading, lookup failures and missing
data are distinguished; failed credential reads do not hide the saved club list.
No raw JEF master data, birth dates or unrelated identities are requested.

Read-only schema/data inspection found that the existing JEF master tables have
the required columns but currently contain no rows. Some shared roster source
records retain historical rider grades; horse grade declarations are not retained
by the current Excel import. Therefore the new horse column honestly shows
`未確認` until grade records are available. Display support does not imply that
missing grade data has been imported or saved. This change does not modify the
database, source records, permissions, eligibility checks or Excel save behavior.

Synthetic tests cover latest records, conflicting/blank/missing grades, strict
number/ID correspondence, historical provenance, request scoping, no mutations,
event/auth guards, display columns and the active-section loading gate. Live
inspection used only SELECT queries; no applicant data is included in this record.
Validation passed: credential-loader, registration-overview, pre-registration and
shared settlement component tests, `tsc --noEmit`, `git diff --check`, and
`next build --webpack` (24 pages). Authenticated browser rendering remains
unverified in this environment.
