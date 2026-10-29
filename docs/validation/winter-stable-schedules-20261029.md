# Winter 入退厩予定の自動反映（2026-10-29）

## Behavior

- Winter application import reads arrival/departure plans from 申込集計書. Supported forms: legacy Reiwa text with trailing hour, separate year/month/day/hour cells, new date/time dropdowns, Excel 1900/1904 serial dates and fractional times. Prefilled year alone is not a plan. Unrecognized text remains visible for correction; it is never guessed or silently discarded.
- Step ② adds inline editable dates, times and notes; step ③ shows the final merged values. Existing values are retained for blank Excel fields. When the date changes, an old time is not silently carried to the new date. Exception requests remain marked notes, not approved dates.
- Dates are Japan local wall-clock values. Invalid dates/times, time without date, non-2026 dates and reversed arrival/departure order are blocked with a correction message. Completely absent dates remain optional.
- Normal registration saves the schedule after organization/participant publication and verifies authoritative readback before entries. Checkpoints retain the original cells, edited values and immutable compare-and-set expectation. Success includes schedule verification. Lost responses and retries do not duplicate fees/entries or restore older dates.
- 入厩情報 adds 入退厩予定の補足・訂正. Already registered clubs can choose a club, enter dates or read only the dates from an application, then click 日時のみ保存. A mismatched nonblank workbook club is rejected; a missing club is explicitly flagged for the selected club to be checked. This path writes no people, entries, charges or payments. Explicit manual blanking can remove a mistaken plan.
- 手帳チェック displays and prints saved dates/times/notes. Each print re-reads current registration and schedule data. Failed reads cannot be printed as blank schedules. 入厩チェックリスト remains the approved A4 landscape two-club layout without dates.
- Existing clubs have no historical saved schedule source; no synthetic/sample/old uploaded application dates were backfilled. The date-only editor is the supported supplementation path.

## Data and isolation

Migration `20261029093102_winter_stable_schedules.sql` was generated with `supabase migration new`, reviewed and applied to the existing FHS Supabase project. It adds an append-only Winter organization schedule history and security-invoker current view. Only authenticated administrators may read and use the guarded RPC; direct client writes are revoked. The private definer validates event, organization/name, input shape and dates, locks by organization, checks expected revision, and returns old retries without creating a newer revision. Request IDs include organization ID, preventing collisions between clubs with identical plans.

No existing registration or money records were changed. SQL regression fixtures ran in BEGIN/ROLLBACK; afterward schedule rows and synthetic organizations were both zero. Security advisor findings for the new objects: none. Existing unrelated legacy findings remain unchanged. Autumn production is outside this deployment.

## Validation

- 25 targeted Node regression suites cover application import/review/checkpoints/registration/services, schedule extraction/persistence and UI, stable reports, existing settlement/horse fees, reading lists, registration overview and shared start-list rendering.
- New schedule tests exercise all three actual workbook layouts, Unicode/Reiwa, Excel 1904, missing/invalid/reversed dates, retained original cells, old checkpoints, blank merging, printed date values and HTML escaping, lost-response readback, retry without duplicate entries/fees, immutable expectations, concurrent update rejection, target-scoped request IDs and authorization/load failures.
- Component tests exercise inline edits, selected organization/revision, double taps, processing/success/failure, wrong-club Excel, read-only preview, preserving blank fields, reload and failed-read print blocking.
- Database SQL tests verify administrator RPC/readback, non-admin RLS and spoofed user_metadata rejection, invalid dates/targets/event rejection, CAS, idempotency, older retries, and unchanged entry/charge counts.
- TypeScript no-emit check, Next webpack build (26 routes), and git diff whitespace check.
- Real attached original workbook extraction was read-only: arrival 2026-11-13 08:00, departure 2026-11-15 17:00; blank new form remained blank. These values were NOT written to live club records.

## Limits

No authenticated browser session or physical iPad/printer was available for this change. UI behavior was tested with real components and synthetic service data; database authorization/save/readback was verified separately with rolled-back fixtures. Final on-device printing remains the organizer's check.
