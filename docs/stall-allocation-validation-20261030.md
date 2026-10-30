# Shared stable allocation / Winter adapter — 2026-10-30

## Source and scope

- Correct source: `25Winter厩舎割(1).xlsx`, sheet `マスター`; `25winter` is the 2025 example, not current applicants. The previously withdrawn 26spring workbook is excluded.
- Original SHA-256: `6df32a277b1d59aa1479445fc2a398321d1106f5d68e683d0fbecd79fb270aa7`.
- Original retained as Library `libfile_48314182ea6881919befd221f69e4709`; common rules as `libfile_5f909bf4d4888191b75a0b6122a24f8b` and `docs/stall-allocation-rules.md`.
- Common topology: S 24 numbered stalls; barns 1–10 each 18 numbered stalls and two unnumbered braced TR bays (224 physical bays total). Club rectangles and facilities are rendered from this topology; the source workbook is untouched.
- Common allocator, editor, rendering and contracts are under `master/`. The new persistence adapter is Winter-only. Other tournament adapters can reuse the master, but have not been wired to the new save endpoint. Autumn reception markup and production deployment are unchanged.

## Behavior

- Explicit deadline/import-complete checkbox gates generation. No real allocation has been generated or saved during development.
- S priority club and configurable small-club limit; normal barns use ascending first-fit, larger clubs first. Oversized clubs span barns without silently losing horse/TR demand. When the priority club cannot fit in S, S remains reserved for manual splitting and a visible issue blocks final printing.
- 150 is the 101–150 band; 151+ enables a shared two-TR tent budget per ordinary barn. All ordinary-barn clubs retain at least one indoor TR. Undeclared bands require an override and reason.
- Auto allocation never puts horses in braced bays. Manual use requires per-bay acknowledgement. Unplaced horses, insufficient TR and orphaned equipment allocations are visible; incomplete plans can be saved as drafts but not printed.
- Whole-club moves and per-slot editing preserve horse IDs. Updating the roster retains valid placements and marks new horses unplaced. Source freshness is checked at save and print.
- Authenticated versioned saves are event-scoped, idempotent, CAS-protected and read back. Old retries cannot restore old versions. Printing also rejects a newer plan saved by another operator until it has been reviewed.
- A4 landscape map followed by a club list with exact horse-stall, indoor-TR and tent positions. There are no writes to entries, fees or payments.

## Verification

Passed domain tests: every TR boundary, topology, S priority/reservation, shared tent capacity, 16-horse/5-TR split, capacity shortage, manual moves, wire acknowledgement, duplicate rejection, roster reconciliation, escaped SVG/print.

Passed component harness: readiness gate, generation remains unsaved, progress/success/failure, double-tap save lock, map slot editing, draft save and print gating, failed-save draft preservation.

Passed HTTP adapter tests: authenticated Winter reads, failed reads, wrong event, lost-response readback recovery, stable retry IDs, concurrent update rejection.

Passed existing stable-information/report and Autumn shared form/reception-layout regressions. Standalone TypeScript checking, `git diff --check`, and production Next build passed on the final implementation.

Migration `20261030065656_shared_stall_allocations.sql` applied. SQL regression executes in BEGIN/ROLLBACK: valid save/retry, compare-and-swap conflict, spoofed admin metadata, anonymous access, DML restrictions, wrong event, invalid slots, duplicate horses/groups, stale names, tent rules and braced acknowledgements. Post-rollback checks: saved allocation rows 0, synthetic clubs 0, synthetic horses 0. Entry/charge counts unchanged. New-object security advisors found no findings.

Synthetic SVG with long Japanese club names was rendered and visually inspected. Source topology was compared to the supplied master. Browser extension was unavailable in this conversation; cloud browser could not reach the local test server. Actual iPad interaction and physical printer output have not been tested. No current registration data was used as a public fixture.
