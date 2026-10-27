# Winter Excel: prepare the roster before assigning entries

The editable source table and the saved shared roster were separate states. Selecting a registered identity did not save corrections, and exact-name reconciliation could report another difference for spacing/full-width variants. Reading corrections and new affiliation choices also had to be handled in a second editor after the entry review.

## Behavior

- Step ② now has two ordered parts: confirm and provisionally prepare riders/horses, then review entries against those stable row identities. The provisional step saves a local draft only. Shared roster/participation/entry writes still require the final confirmed import.
- Names differing only by whitespace/full-width characters, and readings differing only by hiragana/katakana, adopt the explicitly selected saved identity's spelling once. Real name, reading, number and affiliation changes remain visible as before/after values.
- Editing a selected identity keeps its explicit ID and visible candidate. The UI never infers a merge or creates a replacement identity to evade a mismatch. Affiliation selection, including the application club, another existing club, a manually entered club and explicit membership endings, is available in the first roster table.
- All entries reference the same prepared people. Unbound rows are matched only when original/prepared aliases identify one row; manual assignments and immutable Excel evidence are retained. Entry or payment edits retain preparation; people, affiliations or club edits invalidate it.
- Final import saves planned roster corrections first using the existing authorized Winter RPC and persisted request IDs/observed expectations. Exact readback must succeed before participation, qualifications or entries are saved. Concurrent edits stop the operation. Unknown replies and stop/resume reuse the same correction requests and entry identities without duplicating successful work.
- Old checkpoints remain compatible. The credential upgrade path invalidates preparation when it introduces new credential fields. Original workbook data remains unchanged.

## Verification

All fixtures are synthetic. No real participants, uploaded workbook contents, database writes, migrations or permission changes were used.

- TypeScript `--noEmit --incremental false`: passed.
- Application/parser/guide/draft/autofill/multi-rider/shared-table/controller/registration/services/credentials tests, new roster-stage tests, roster-correction/binding tests and shared Autumn/Winter input regressions: 16 modules passed.
- New tests cover no-write preparation; cosmetic normalization; exact original preservation; selected-ID retention; before/after correction summaries; legacy draft/checkpoint roundtrip; invalidation; unbound alias matching; explicit affiliation movement; preview-only club IDs never entering writes; correction-before-entry ordering; existing Winter ID/organization preservation; lost replies; stop/reload; duplicate identifier rejection; concurrent modification, authorization, storage and readback failures; reimport without duplicate corrections or entries.
- Shared controller rendering tests cover disabled entry controls until roster preparation, editable affiliation controls in step ② and absence of the second correction editor after preparation.
- Optimized `next build --webpack`: passed. This local checkout uses a dependency symlink, so webpack is used locally; normal Vercel build is checked separately.

Browser pixel/interaction verification and live database integration are not claimed. No Chromium executable is available in the local runtime. The shared row/field component keeps responsive structure and its existing disabled controls. The full Autumn UI is not migrated into the Excel review component by this change.

## Deployment scope

The change targets the existing `prep/winter-2026` preview alias. It does not update `main`, Autumn production, schema or permissions. The organizer will reread the real Excel and confirm registration in the updated screen.
