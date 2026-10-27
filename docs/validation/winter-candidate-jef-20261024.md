# Winter candidate numbers and authorized registration reset (2026-10-24)

## Candidate selection

Choosing an existing rider or horse copies that candidate's JEF number into the
editable review, including clearing a previous number when the candidate has none.
The selected identity is retained in the same update. Workbook source values are
unchanged. Missing numbers display `なし` in review inputs, candidate labels,
registration recovery options and the organization registration overview. The
stored absence remains an empty value, never the literal text `なし`.

Selection does not mark the number verified. Changing the identity, name or number
clears verification; selection also invalidates amount confirmation and any stale
registration preview. The verification checkbox explains the required person/horse
check and is disabled when there is no number to verify. Existing official-class
eligibility rules still require the appropriate numbers and qualifications.

A newly supplied rider number triggers an authenticated qualification lookup, so a
blank workbook number does not prevent qualification autofill after selection.
Manual grade corrections and original workbook values remain intact. The existing
busy/frozen guards protect the operation; no new persistence or permission path is
introduced. Shared rendering and neutral candidate behavior remain in the master.

## Authorized Winter data reset

The organizer explicitly requested removal of one club's Winter entries and
participating people/horses for re-registration. The exact event and club were
resolved against existing organization and shared-roster IDs. A complete private
JSON backup was saved durably before mutation. Its SHA-256 is
`303893eb6463507608e806d3d3dee9d3896a6110e176dc581301fba2fc275182`.
No applicant rows, identity IDs, backup content or private SQL are in this commit.

One transaction compared all target rows with the saved backup, checked dependent
records, removed the scoped rows, and verified untouched-row fingerprints:

| Record | Removed | Remaining for target |
| --- | ---: | ---: |
| Winter riders | 7 | 0 |
| Winter horses | 9 | 0 |
| Entries | 6 | 0 |
| Initial entry fee rows | 6 | 0 |
| Winter participant snapshots | 16 | 0 |
| Winter identity bindings | 16 | 0 |

The six removed fee rows totalled 62,000. There were no target payment, adjustment,
receipt, request, start-order-draft, credential or change-history records requiring
removal. The organization and shared club, identities and affiliations were kept.
Untargeted rows in the six affected tables and all shared master/organization/
credential rows retained identical fingerprints in the transaction. Normal Winter
refresh notifications were allowed. A separate committed read confirmed zero
entries/riders/horses and preserved organization/shared-club rows. No schema,
authorization, main-branch or Autumn data change was performed by this reset.

Existing browser registration checkpoints can still refer to the deleted result.
For the organizer's one-time fresh import, use a fresh private browser window and
the original Excel instead of restoring the old registration JSON. Normal tabs
share local storage and do not provide that separation. No checkpoint guards were
weakened and the original browser records were not overwritten.

## Validation

Passed: separate TypeScript check; `next build --webpack` (24 pages); diff check;
application extraction, autofill, draft, guide, review-component, service,
registration-core, registration-component and registration-overview suites.
Existing Autumn input and settlement HTML comparisons and shared reception layout
checks also passed. Tests use synthetic fixtures and make no real registration or
payment calls. Candidate tests cover copying, no-number switching, confirmation
invalidation, original preservation, lookup of a newly supplied number, manual
qualification retention, invalid-candidate rejection and checkpoint round trips.

React review checked labels, disabled/busy states, source immutability and guarded
async updates. No authenticated browser control is available in this session;
deployed UI interaction with a real Excel file remains the organizer's next check.
Only the dedicated feature branch/PR and its Preview are updated; no merge to
`prep/winter-2026` or production promotion is included.
