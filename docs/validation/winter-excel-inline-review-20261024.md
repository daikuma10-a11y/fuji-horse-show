# Inline Excel review tables (2026-10-24)

The organizer reviewed the tabular Preview and requested direct editing in the
cells, visible identification of the affected fields, removal of the right-hand
review/edit action, and a layout that fits the available width.

## Behavior

- Rider and horse cells contain the editable name/reading, explicit candidate
  selection, JEF number/verification, qualifications, memberships and horse
  declaration. Entry cells contain competition, rider, horse and OP controls.
  Amount corrections remain editable in the amount table. There is no separate
  edit column, expansion button or hidden editable detail row.
- Amber borders/background and a written reason identify blocking fields; blue
  identifies advisory fields. `aria-invalid` and linked descriptions convey the
  same status without relying on color. Markers are derived from current review
  results and disappear after the corresponding condition is corrected.
- The validator adds presentation metadata to its existing issues. Official
  eligibility and fee-category issues link to the actual rider/horse field
  (missing number, number verification, qualification, membership or instructor
  qualification). Validation conditions, prices and registration gates are
  unchanged. Repeated person-field notices are deduplicated in the guide.
- Issue navigation scrolls/focuses the affected inline input. Entry warnings
  can navigate to the corresponding person's cells. Source and candidate
  evidence remains available as supplementary disclosure text.
- All four tables use fixed layout, 100% column allocations and shrinkable
  controls. The previous 760/960/980px minimum table widths are removed.
  Headers and long names wrap; full selected entry labels remain visible under
  native selects. Below 760px of available container width, rows reflow to two
  labelled columns, including the amount table. No data columns are hidden.
- Workbook keys/order, all entries, source immutability, explicit identity
  choices, edit invalidation, busy/frozen locks, fees and draft persistence are
  retained. No database, payment, permissions or production changes were made.

Presentation remains in the shared master. Neutral issue-field contracts live
in `lib/master/`; Winter validation supplies event-specific metadata. Existing
Autumn input/settlement markup comparisons pass. Autumn's Excel adapter remains
unmigrated; no claim of completing that separate migration is made.

## Validation

Passed:
- `tests/winter-application-table.cjs`: 60 entries with stable order/keys; direct
  name/reading/JEF/candidate/grade/membership/declaration/entry/OP/amount edits;
  no hidden editors or action column; exact blocking/advisory fields clearing on
  correction; official, membership, instructor and OP prerequisites; busy/frozen
  locks; issue focus; totals and unknown fees; no source mutation/network.
- `tests/winter-import-review.cjs`, `tests/winter-import-registration.cjs`,
  `tests/winter-application.cjs`, `tests/winter-application-guide.cjs`.
- Review and registration component/controller tests, including original/draft
  preservation, candidate number copying, verification invalidation, explicit
  confirmation, retry protection and auth/event/storage guards.
- `tests/master-input-forms.cjs` and `tests/master-admin-settlement.cjs` (Autumn
  markup preservation and Winter settlement display).
- Final `next build --webpack` (24 pages), then separate
  `tsc --noEmit --incremental false`, and `git diff --check`.
- Generated CSS includes fixed table sizing, wrapping, container sizing and the
  760px reflow rules. An initial concurrent type check raced with build-generated
  `.next/types` replacement; the final sequential check completed successfully.

These are synthetic HTML/control/source checks, not authenticated browser visual
measurements. No connected local browser or installed local browser executable
was available. The organizer's actual Excel and desktop display are the remaining
visual/interaction check after the dedicated Preview is updated.

Save only public source, synthetic tests and this record to the existing feature
branch/PR 6, retrieve the saved tree from GitHub, and verify its Preview SHA/alias.
No merge into `prep/winter-2026` or promotion to production is included.
