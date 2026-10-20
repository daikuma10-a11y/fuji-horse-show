# Winter Excel import — checkpoint 3 (not released)

Checkpoint 1 (`3923b25`) is preserved and reused. Checkpoint 2 connects its extraction/review helpers to Winter admin → 事前登録 → 申込書の読み込み. The new screen supports local Excel selection/drop, an explicit read action, source/edited value comparison, roster candidate selection, fee review, revision comparison and review-only JSON/local checkpoints. Database registration is deliberately not connected at this small checkpoint. No participant registration or payment operation has been performed. The existing CSV/TSV registration flow remains unchanged.

Checkpoint 3 adds the registration runner, result checkpoint codec and adapters for the existing Winter services. The screen still does not call that runner: explicit confirmation, result display, unknown-person resolution and registration-result file controls are the next checkpoint. The runner has been tested only against synthetic in-memory data and service stubs, never the live database.

## Supported source

The organizer-supplied blank 2026 Winter `.xlsx` form, with 30 rider slots, 20 horse slots, and four collapsed entry blocks per discipline. `.xls`, `.xlsm`, PDF, macros and external workbook links are not supported. Formula values use the result saved by Excel; formulas are never executed. Missing required results require original-document confirmation or a recalculated workbook.

| Source | Fields |
| --- | --- |
| Rider roster (`A2=選手名簿`) | Number in A; reading in B on number row; name in B on next row; JEF number in D; qualification in E; club D on the row labeled 団体名 in C |
| Horse roster (`H1=馬匹名簿`) | Number in A; reading in B on number row; name in B on next row; JEF number in C |
| Jump blocks (`D=種目`, `E=馬名`) | Horse headers J:N; competition number C; rider names J:N; newlines separate riders; parentheses mark OP |
| Dressage blocks (`D=馬名`) | Horse headers F:J; competition number C; rider names F:J; newlines separate riders; parentheses mark OP |
| Summary (`A2=申込集計書`) | Saved values F6 horse registration, F7 jump, F8 dressage, F10 original total |

All matching entry sheets are inspected regardless of sheet name, visibility or collapsed rows. Copied entry sheets are included; duplicate competition/person/horse combinations are sent to the existing validation logic. Unrecognized person names remain unresolved. Existing database identity suggestions never select or merge identities.

JEF verification, membership and instructor qualifications require explicit administrator confirmation. Planned transfer dates do not establish payment. Confirmed paid amount is a separate input, initially blank. Fees reuse `reviewWinterImport`, `winterEntryPrice` and `WINTER_HORSE_REGISTRATION_FEE`.

## Registration core implemented in checkpoint 3

- `winter-application-services` verifies the existing admin session before each operation and calls existing roster, participant and initial-entry functions. The existing Winter identity bridge is read by UUID with authenticated, paginated GETs; no name-to-event-ID inference or new database object is introduced.
- `winter-application-registration` rechecks source/fees/event/affiliation before writes, records an unknown outcome before each request, confirms success from authoritative reads, and reuses the existing one-entry runner and retry IDs.
- Existing selected people require matching names/JEF and the application-club affiliation. No existing identity update or affiliation replacement is called. A new person with any existing candidate is blocked. If a new-person response is lost before its ID is recorded, execution stops without resending; an administrator must explicitly match the saved identity, including its reading and affiliation. If no saved identity can be established, this module does not infer that it is safe to resend.
- Participant publication receives the union of current participants and selected people, with the existing expected-ID check. Existing event names/JEF/snapshots are checked first because that RPC can refresh event records from snapshots; differences block publication rather than being overwritten.
- A versioned `winter-application-registration` checkpoint freezes the original/edited review, reference, identity choices, original invoice and separate confirmed paid amount. It records people, participation and per-entry outcomes. Stale-save and rollback checks preserve previous results. No payment write is called.

## Remaining implementation

- Connect the core to explicit admin confirmation and display authoritative save results, stop/resume controls, unknown-person resolution and registration-result JSON import/export in the shared screen.
- Prevent concurrent registration actions in the screen and coordinate tabs. The checkpoint compare-and-write guard alone is not an atomic cross-tab/cross-device lock. Existing new-person RPCs have no client retry ID or name uniqueness constraint; do not claim safety for simultaneous new-person creation by independent administrators/devices.
- Connect frozen review/revision safeguards to partial-registration UI. Current revisions are comparison-only and never replace the active review; the registration codec rejects altered source, mappings or amounts on resume.
- Real-screen and real-device checks after an authorized delivery path is available. No new-code push, PR or deployment is authorized at this point.

## Review operations and persistence

1. Open `/winter/admin#winter-application-import` after normal admin login. The new code is local and has not been deployed.
2. Choose/drop one supported workbook, then click 読み込みを開始. Reading alone makes no database request.
3. Compare names, JEF IDs, qualifications, entries and amounts against the displayed source sheet/cell. Unselected membership and identity decisions remain unresolved.
4. 既存の人馬候補を読み込む reuses the existing verified-admin and shared-roster read functions. Select a candidate explicitly, or mark a new-person candidate. Neither choice registers or updates anything. Editing a person's name/reading/JEF clears their prior selection; editing invoice inputs invalidates invoice confirmation.
5. 確認途中をこの端末に保存 uses an event-scoped, source-digest key. A changed saved value since the last explicit read blocks overwrite. This detects stale drafts; it is not a cross-device transaction or database registration safeguard.
6. 確認再開JSONをダウンロード preserves original and edited values, source positions, reference, identity choices, original invoice and separately confirmed paid amount. The versioned `winter-application-review` format is explicitly distinct from registration-result checkpoints and rejects another event or malformed structure. No session/token is exported. Save before leaving; no autosave is claimed.
7. Reading another workbook while a review is open shows additions/changes/cancellation candidates without replacing active inputs. To start a separate review, export the existing review via 確認再開JSONを保存して別の申込書へ.

Shared presentation lives in `components/master`; neutral types live in `lib/master`. Winter source rules/configuration and existing authenticated roster access remain in the event adapter. Adapters without the optional Excel content retain the two existing preregistration sections. All visited forms remain mounted through section changes.

## Verification limits

Fixtures are entirely synthetic and contain no original workbook bytes, real participants, contact details or bank instructions. Tests cover extraction (`winter-application.cjs`), bounded/versioned JSON and stale-save detection (`winter-application-draft.cjs`), review interactions using component mocks (`winter-application-components.cjs`), and shared two/three-section compatibility plus signed-out access (`winter-preregistration-components.cjs`). Component mocks are not real browser/DB evidence. A standalone TypeScript check is necessary because the existing Next configuration skips build-time type validation.

Checkpoint 3 tests (`winter-application-registration.cjs`, `winter-application-services.cjs`, `winter-roster-bindings.cjs`) cover normal registration, existing identity mapping, reimport without a second charge, losses of responses at all three save stages, explicit resolution of an unknown new person, stop/resume between people and between entries, preservation of unrelated participant/entry/fee history, fee/category/affiliation/event/auth/storage failures, frozen checkpoints and bridge pagination/validation. Relevant existing shared-roster loading/refresh and import-registration tests were also run. All use synthetic data or stubs, not real database state. Standalone TypeScript and Next.js build passed; no full or management suite was repeated.

Actual database saving, real-device downloads, actual browser controls, real authentication/roster reads, concurrent operators and the complete Excel-to-registration screen flow remain unverified. No management tests, dummy database insertion, payment writes, schema/permission changes or Autumn deployment are part of this checkpoint.

Automatic Library saving remains blocked by the earlier `hosted apps tools/list` HTTP 403. It has not been retried. The organizer approved temporary manual preservation: produce and independently verify a recovery archive, provide its bytes/hash/base commit, and stop additional implementation until the organizer confirms downloading it.
