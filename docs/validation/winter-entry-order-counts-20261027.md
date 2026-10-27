# Horse order and competition count reconciliation — 2026-10-27

The Excel entry review now groups entries in the application's horse-roster order. Within each horse it retains source order. Sorting is a view of `{entry, sourceIndex}`: it does not reorder the stored entry array, detach prices, change row keys, or change the TSV order used for stable registration IDs.

Winter extraction retains the specified form's count cells for every competition in each sheet/horse block, including rows with counts but no rider. It compares each bucket independently with the edited entries: normal/OP, sports association member/nonmember (5 and 25), instructor association member/nonmember (8 and 32), and dressage OP. Membership count cells below the label row are handled separately. Count-only rows do not create entries. Opposite errors in different competitions, blocks or copied sheets cannot cancel.

The shared review shows yellow warnings with competition, sheet/cell, submitted count and detected entries. Counts can be corrected inline; submitted cells and formulas remain visible and immutable. Corrections are saved with the review/checkpoint and require renewed amount acknowledgement. Both the advance-to-review gate and registration preflight reject unresolved count discrepancies. Manual additions inherit their source entry's block, or use a unique horse/competition block. When a block cannot be uniquely assigned, the row requires an explicit selection of the source count block instead of silently omitting that entry from the comparison.

Older review JSON remains readable. Reading the identical Excel can add count metadata to an unfinished old draft without losing identity mappings or edits. Frozen registration checkpoints are never upgraded in place. An old JSON alone cannot supply cells that were not extracted originally; reread the Excel to enable the new checks. Extraction is for the supplied Winter layout, not an arbitrary spreadsheet layout or formula evaluator.

## Verification

- Synthetic equivalent of the reported case: competition 26 has count 1 but no rider; competition 30 has one rider but a blank count. Overall money matches; both count errors block registration. Correcting counts to 0 and 1 clears the two warnings without altering source values.
- Separate blocks and copied sheets, multi-rider cells, normal/OP offsets, member/nonmember rows, dressage including competition 32, cached formula counts, invalid counts, ambiguous manual additions and explicit block selection.
- Review and registration checkpoint validation, source immutability, count correction roundtrip, same-file upgrade, inline callbacks and disabled/frozen controls. A synthetic runner preflight verifies zero writes when counts are inconsistent.
- Sixty-entry shared table regression checks horse grouping, original fee indexes and edit keys, all visible rows, narrow-container layout structure and source/TSV immutability.
- Fifteen relevant standalone test modules cover the importer, roster preparation, registration/resume, fee rules and service guards. Fixture helper modules are not standalone tests.
- TypeScript validation and optimized Next.js webpack build. The local dependency symlink requires webpack; deployment configuration is unchanged.
- Read-only inspection of the existing original and revised template layouts verified 160 count rows each, including Q33 (first-block competition 26) and Q84 (second-block competition 30).

Presentation and neutral count contracts live in the shared master. Only Winter currently uses the Excel application-review adapter; this does not claim a new Autumn Excel migration. No Autumn route, fee rule or database adapter was changed. No live registration, participant, entry, payment or settlement was written. Validation used synthetic data and component rendering; the newly photographed populated workbook and an actual iPad browser were not available for an end-to-end test.
