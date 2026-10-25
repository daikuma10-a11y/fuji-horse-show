# Winter public reception confirmation — 2026-10-25

## Result

Additional entries, changes and withdrawals can be staged without a per-request operator name. The final pending list asks once for the person who came to reception. It binds that name to every request, persists the exact IDs/name before transmission and confirms without a headquarters login. Headquarters reflection, meeting confirmation, roster management and payment operations retain their existing authorization.

The fix starts from `prep/winter-2026` commit `5c70012f41a2e6e7a142c99333fbe1526a11bc3f`. It retains the Winter home-screen fix. `main` and Autumn production are outside this release. All current Winter entries remain test data, not actual applications.

## Persistence boundary

- `/api/winter-reception` accepts only same-origin writes using a scoped HttpOnly, SameSite=Strict device cookie. The existing Winter server proxy secret stays on the server. No secret was retrieved, copied or added to client code.
- The existing `winter-self-settlement` Edge Function adds only `reception-ready` and `reception-confirm` actions after its existing server-secret/device checks. Existing settlement actions are unchanged.
- `submit_winter_public_reception_batch` is invoker-only and executable only by `service_role`. It verifies the active device and a single final visitor, then calls the existing atomic batch. It does not impersonate an admin.
- Six existing submission guards accept either the existing administrator or a service call inside that validated, transaction-local device scope. Their fees, event checks, IDs, original-entry comparisons and payload generation remain unchanged. No anonymous table/RPC grants were added. Reflection and meeting functions were not relaxed.
- Queues that had already been sent by an older screen retain the original per-request names and IDs. With no new batch visitor, the server only acknowledges requests that already exist; it cannot create new unnamed requests.
- The local queue clears only when the exact request IDs and total are acknowledged. Network/unknown results keep the queue frozen. A definitive transactional rejection allows corrections.

Migration applied: `20261025070205_winter_public_reception`. The file was initially created with Supabase CLI 2.82.0, then renamed to match the applied server migration version. Canonical SQL: `supabase/sql/winter_public_reception.sql`. Edge Function: `winter-self-settlement` version 4.

## Verification

- New queue tests: all three request types defer names, one final name binds all items, meeting/direct saves remain strict, existing queues work, retry payloads are identical, wrong receipts do not clear a queue.
- New route tests: origin/device validation, cookie scoping, expired-device renewal, action/name/duplicate rejection before upstream calls, no server secret in responses, definitive versus uncertain errors.
- React DOM interaction test (jsdom 26.1.0): one visitor input/no login; blank name prevents submit; network error freezes the name and IDs; remount restores them; exact retry confirms all three and clears the acknowledged queue.
- 14 relevant Node test files passed, including existing reception, meeting, shared forms, fee rules, request actions and settlement regressions. TypeScript and Next webpack build passed (26 routes).
- Database tests ran with synthetic fixtures inside rolled-back transactions, including an actual `SET LOCAL ROLE service_role`: add/change/withdraw batch, repeat receipt, total mismatch rollback, changed retry rejection, expiry/revocation, no device-scope leak, anonymous/user-metadata rejection, admin-only reflection/meeting, foreign-event rejection, and prior admin behavior.
- Existing master reception database tests also passed, including affiliation, request reflection and meeting audit behavior.
- Row counts and whole-row hashes for 17 existing business tables were identical before and after the tests. Security advisor output was unchanged (excluding observation timestamps).
- No real application, entry, charge or payment was created/changed by these tests. Device setup creates only short-lived technical device records during HTTP checks.

Physical iPad interaction/printing was not performed here. A browser binary could not be downloaded in this environment; DOM interaction, built HTTP responses and transaction tests provide the automated evidence. Existing Autumn master screen layout tests pass. The new final visitor field is in `components/master`; this change does not claim migration of every older seasonal screen into a common final-confirmation component.

The Excel feature branch still needs its own Winter server connection environment before its public reception/settlement endpoints can be used. The connected reception URL remains the `prep/winter-2026` preview, not a production promotion.
