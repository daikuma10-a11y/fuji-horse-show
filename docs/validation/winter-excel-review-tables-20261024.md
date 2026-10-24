# Excel review tables (2026-10-24)

The subsequent inline-editing revision is recorded in
`winter-excel-inline-review-20261024.md`; expansion controls described below are historical.

The organizer supplied sketches and requested a tabular review after Excel import,
so larger applications can be checked without overlooking entries. The shared
master now presents separate rider, horse and entry tables. Each item has one
summary row, preserving workbook order and its original key.

- Rider columns: name, reading, JEF number, qualification, riding association,
  instructor association and review action. Regional instructor qualification
  remains visible. Horse columns include the grade declaration.
- Entry columns: competition, rider, horse, application club, OP, fee and review
  action. The club is explicitly labelled as the application club rather than
  inferring a different billing affiliation from a candidate.
- Numbered rows, contrasting alternate rows, sticky column headings and first
  column, and scrollable table regions support long lists and narrow viewports.
  All entries remain present; there is no filtering or pagination.
- Blocking rows are amber and show an issue count. The original issue navigation
  now opens the target row's correction controls before scrolling and focusing it.
  The long overall issue list is expandable, with its count always visible.
- `確認・訂正` expands the existing identity selection, editable fields, number
  confirmation, membership, qualification/grade, OP and source evidence controls.
  Closing a row preserves those controls and draft values. Frozen records remain
  inspectable with editing disabled; busy locks and confirmation gates remain.
- Below entries, a summary shows horse count times the existing event unit fee,
  horse fees, entry total and overall total. It consumes the existing calculation
  result; unknown fees display `未確認`, not zero or an old total. The text explains
  that duplicate registration is reconciled in step 3. Original amount comparison
  is also a table and keeps the existing correction callbacks.

Rendering and row interaction live in `components/master/`. The Winter adapter
only supplies the current horse unit fee/count and existing entry total. No fee
rules, identity matching, registration/persistence, database schema/data, payment,
permission, production or Autumn deployment changes are part of this work.
Autumn does not yet consume the Excel review component; this does not claim its
Excel adapter migration is complete.

Validation passed:

- `tests/winter-application-table.cjs`: 60 ordered entries, all rows retained,
  rider/horse columns, totals from existing pricing, unknown-fee handling,
  last-row edit/OP callbacks, warning navigation, expansion/collapse, retained
  controls and frozen inspection. Synthetic data and mocked browser callbacks.
- Review/controller and registration/controller suites, including candidate JEF
  copying, original preservation, checkpoint conflicts, identity confirmation,
  duplicate protection, stop/resume, auth/fee/event guards and frozen editing.
- Existing guide tests and exact Autumn input/settlement HTML comparisons.
- Separate TypeScript check, `next build --webpack` (24 pages), `git diff --check`.

No authenticated browser control or local browser executable was available.
These checks cover source, rendered HTML and event handlers, not a real-browser
visual/scroll test or the organizer's actual workbook. Next verification is the
organizer opening the dedicated Preview and checking the tables with an Excel.
The feature branch and PR 6 are updated; no merge or production promotion occurs.
