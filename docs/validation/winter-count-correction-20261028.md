# Correct count mismatches where they are explained

The competition-count review previously displayed sheet/cell addresses and could only edit the declared count. An omitted rider/horse required returning to the main entry table.

The shared review now shows the configured competition name and starts with a plain-language explanation, such as: `Excel原本では出場者1名となっていますが、人馬の記載がありません。` Cell coordinates remain in the immutable source record, without occupying the correction card. Multiple source pages of the same competition remain separate, identified by their horse group.

Two local correction paths are available in the same card:

- Correct a mistaken count, including zero when nobody is entered. This never invents an entry or changes entry fees.
- Select a rider and horse from the prepared application roster, select OP when applicable, and add the omitted entry. The new row carries the exact competition and count block of the card. It can be edited or undone there, and immediately participates in existing count and fee calculations. Duplicate rider/horse combinations in the competition are rejected.

Added rows use the existing manual-entry identity and checkpoint format. Prepared roster signatures stay valid; the financial confirmation is reset. Original Excel values and reviewed claim amounts are preserved. Successful additions remain visible with the resolved count, rather than disappearing into the collapsed matched section. Registration still uses the established final confirmation, fee, identity, permission and retry guards.

Validation:

- Seventeen synthetic standalone test modules passed, including both correction paths, actual controller callbacks, exact block isolation for copied pages, OP and membership counting, 12,000-yen entry-fee recalculation, duplicate prevention, add/edit/undo, disabled controls, source preservation and checkpoint roundtrips.
- TypeScript validation, whitespace checks and the optimized Next.js webpack build passed. Both season routes compiled; the shared local dependency symlink requires webpack, with no deployment configuration changes.
- The responsive shared component keeps the two participant selectors in a wrapping grid and provides text explanations, labels, status/error announcements and touch-sized controls.

No live roster, entry, claim, payment or settlement records were modified. Tests exercise component rendering and handlers; no authenticated operator browser or actual iPad was used. Autumn's older Excel adapter has not been newly migrated; the event-neutral component and Winter adapter remain separate. Publication is limited to the Winter preparation branch.
