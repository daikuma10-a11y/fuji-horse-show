# Winter Excel import feedback — 2026-10-27

The import action now shows its state immediately and keeps a progress panel visible while the administrator scrolls. The shared master component distinguishes saving, final verification, completion, stopped/unfinished work, and errors using both text and color. It shows verified rider/horse and entry counts (including existing registrations), the current stage, and the final confirmation time in Japan time. Completed imports expose the start list and settlement actions. Errors and stopped work offer a read-only result check before resuming.

Completion still requires an authoritative final review of the people, participation, credentials, and every entry. A successful request, a full progress bar, or a restored JSON flag cannot independently show success. Stop requests made during preflight now remain effective before the first write. The existing lock prevents repeated submissions throughout preflight and saving. Status observations are display-only and are not added to registration checkpoints.

The change retains Winter authorization, event isolation, fee checks, checkpoint/request IDs, readback requirements, and existing-record preservation. It does not change database schemas or issue any real registration, payment, deletion, or roster update as part of validation. Shared rendering is in `components/master/`; the event-specific runner supplies observations.

## Verification

- Twelve targeted test modules passed: shared status rendering, Winter registration controller, application registration, roster preparation, credentials, services, entry registration, import review, shared Autumn input forms, Winter input adapter, inline application tables, and application controller.
- The actual hook and shared React components were exercised with synthetic services: feedback during held preflight; stop before mutation; a held person request not counted before readback; partial stop/resume; lost entry response; read-only recovery without rebilling; final verification held at a full entry count without premature success; stale edit invalidation; restored checkpoints without trusted completion; authorization/storage/fee/tab-lock guards.
- Shared status markup tests cover fixed progress presentation, text plus color, native progress values, reduced-motion spinner, Japan confirmation time, read-only recovery, and accessible stop controls.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false` passed.
- `node node_modules/next/dist/bin/next build --webpack` passed (all 26 routes generated). Webpack was used locally because the checkout shares its dependency directory through a symlink.

These are synthetic component/controller tests, not a live browser/DB registration. No real club data was changed during validation.
