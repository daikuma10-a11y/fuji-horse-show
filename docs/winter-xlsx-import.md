# Winter Excel import — checkpoint 4 (not released)

Checkpoint 1 (`3923b25`) is preserved and reused. Checkpoint 2 (`05848af`) connected its extraction/review helpers to Winter admin → 事前登録 → 申込書の読み込み: local Excel selection/drop, explicit reading, source/edited comparison, roster candidate selection, fee/revision review and review-only JSON/local checkpoints. Checkpoint 3 (`77dd40a`) added the registration runner, result codec and existing-service adapters. None of these commits has been recreated or published. The existing CSV/TSV registration flow is unchanged.

Checkpoint 4 connects the runner to explicit admin confirmation, authoritative result display, stop/resume, unknown-person resolution and registration JSON controls in the common master. The flow has been tested with real component/controller/registration functions and synthetic in-memory services, never the live database. No actual participant registration or payment operation has been performed.

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

## Registration screen implemented in checkpoint 4

- `components/master/application-registration.tsx` is event-neutral presentation. `use-winter-application-registration` owns Winter state and service calls; `WinterApplicationImport` coordinates the existing review and the new result panel. The original input is editable until registration starts, then frozen. Revision files remain comparison-only. Review-only saves cannot replace an active registration record.
- Review loads current authorized data without writes. Two explicit confirmations precede registration. A changed input invalidates confirmation. Preflight is repeated after acquiring an event-scoped Web Lock; unsupported/busy locks stop instead of falling back. A per-component lock also prevents double clicks. Only this Excel workflow cooperates in the lock, within one browser storage/origin context; legacy forms and separate browsers/devices are not locked. The operator must confirm no parallel registration through those paths. See the [Web Locks request contract](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request).
- Registered, unregistered and uncertain outcomes are shown separately. File/local reopening does not trust saved status as current DB evidence; an explicit review reads back authoritative results. Stop completes the in-flight record and preserves the rest. Leaving the mounted screen before preflight completes prevents writes from starting.
- Unknown new people require an explicit roster ID selection and fresh exact matching; resolving an ID does not itself create another identity. A server-returned ID is retained in memory and can be exported even when the subsequent local write fails. The current checkpoint is retained on errors; no automatic retry is performed.
- Local storage checkpoints use the existing versioned codec and stale-write checks. Registration-result JSON can be exported, reopened or used to close the current application while retaining local records. A replaced local record or conflicting imported source/mapping/known ID stops without overwrite. A newer exported result can be reopened against an older local record only if it preserves the fixed review and known results; opening alone does not overwrite that record or write to the database. JSON contains names and amounts, never session tokens.

## Remaining verification and delivery

- Real-screen and real-device checks, including downloads/reopening, real authentication, actual database results, network disconnection and browser lock behavior, remain pending. The prior credential-protection obstacle was not retried or bypassed.
- Existing new-person RPCs have no client retry ID or name uniqueness constraint. Do not claim safety for simultaneous new-person creation by independent operators or legacy/manual registration screens. Supporting that concurrency would require a separately reviewed design; the current flow requires a single operator/path.
- No new-code push, PR, merge or deployment is authorized at this point. The public Winter screen has not been updated with these Excel commits.

## Review operations and persistence

1. Open `/winter/admin#winter-application-import` after normal admin login. The new code is local and has not been deployed.
2. Choose/drop one supported workbook, then click 読み込みを開始. Reading alone makes no database request.
3. Compare names, JEF IDs, qualifications, entries and amounts against the displayed source sheet/cell. Unselected membership and identity decisions remain unresolved.
4. 既存の人馬候補を読み込む reuses the existing verified-admin and shared-roster read functions. Select a candidate explicitly, or mark a new-person candidate. Neither choice registers or updates anything. Editing a person's name/reading/JEF clears their prior selection; editing invoice inputs invalidates invoice confirmation.
5. 確認途中をこの端末に保存 uses an event-scoped, source-digest key. A changed saved value since the last explicit read blocks overwrite. This detects stale drafts; it is not a cross-device transaction or database registration safeguard.
6. 確認再開JSONをダウンロード preserves original and edited values, source positions, reference, identity choices, original invoice and separately confirmed paid amount. The versioned `winter-application-review` format is explicitly distinct from registration-result checkpoints and rejects another event or malformed structure. No session/token is exported. Save before leaving; no autosave is claimed.
7. Reading another workbook while a review is open shows additions/changes/cancellation candidates without replacing active inputs. To start a separate review, export the existing review via 確認再開JSONを保存して別の申込書へ.
8. Choose 既存登録を照合・保存結果を再表示. Resolve all listed identity, affiliation, fee and account issues. Review itself never writes to the database. Existing identities that need a correction or affiliation change must be handled through the existing roster workflow, without overwriting them from Excel.
9. Confirm the listed content and that the application is not being registered simultaneously elsewhere. Choose 管理者として確定・1件ずつ登録／再開. Inputs become fixed; local checkpoints are written before requests and after confirmed results. Current save results are displayed after readback. 原本請求総額 and 確認済み入金額 remain separate; there is no payment write.
10. 処理中の1件を確認して停止 stops at the next record boundary. Use the same reference and newest 登録再開JSON, or この資料番号の登録途中を開く, then review and explicitly confirm again to resume. Do not create a new reference to bypass a discrepancy.
11. If a new person's ID was not returned, review the roster, explicitly select the matching saved person and choose この人馬と照合して再開記録を保存. If no identity can be established, stop and check the existing roster workflow; absence of a response does not establish that creation failed.
12. Use 原本・対応・途中結果を登録再開JSONに保存 before leaving/changing devices. 登録再開JSONを保存して別の申込書へ exports the current record and clears the screen while preserving local records. Check the downloaded file yourself; initiating a download is not proof that it reached the device.

Shared presentation lives in `components/master`; neutral types live in `lib/master`. Winter source rules/configuration and existing authenticated roster access remain in the event adapter. Adapters without the optional Excel content retain the two existing preregistration sections. All visited forms remain mounted through section changes.

## Verification limits

Fixtures are entirely synthetic and contain no original workbook bytes, real participants, contact details or bank instructions. Tests cover extraction (`winter-application.cjs`), bounded/versioned JSON and stale-save detection (`winter-application-draft.cjs`), review interactions using component mocks (`winter-application-components.cjs`), and shared two/three-section compatibility plus signed-out access (`winter-preregistration-components.cjs`). Component mocks are not real browser/DB evidence. A standalone TypeScript check is necessary because the existing Next configuration skips build-time type validation.

Checkpoint 3 tests (`winter-application-registration.cjs`, `winter-application-services.cjs`, `winter-roster-bindings.cjs`) cover normal registration, existing identity mapping, reimport without a second charge, losses of responses at all three save stages, explicit resolution of an unknown new person, stop/resume between people and between entries, preservation of unrelated participant/entry/fee history, fee/category/affiliation/event/auth/storage failures, frozen checkpoints and bridge pagination/validation. Relevant existing shared-roster loading/refresh and import-registration tests were also run. All use synthetic data or stubs, not real database state. Standalone TypeScript and Next.js build passed; no full or management suite was repeated.

Checkpoint 4 ran `winter-application-registration-components.cjs` using the real shared screen, Winter hook and registration runner against synthetic services. It covers explicit confirmation, displayed results, frozen inputs/revision comparison, JSON export/reopening, reimport with no second charge, stopping/resuming, lost person/entry responses, explicit unknown-person binding, post-ID storage failure recovery, missing/busy tab locks, changed fees/auth/storage/event errors, stale records and unmount during preflight. The existing registration test was rerun after its synthetic setup was moved into a shared fixture; review-component and preregistration compatibility tests were run for changed presentation/adapters. TypeScript and Next.js build passed. Existing unchanged extraction/service/bridge tests are prior evidence, not newly rerun results. No full or management suite was repeated.

Actual database saving, real-device downloads, actual browser controls, real authentication/roster reads, concurrent operators and the complete real-browser Excel-to-registration flow remain unverified. No dummy database insertion, payment writes, schema/permission changes or Autumn deployment are part of this checkpoint.

Automatic Library saving remains blocked by the earlier `hosted apps tools/list` HTTP 403. It has not been retried. The organizer approved temporary manual preservation: produce and independently verify a recovery archive, provide its bytes/hash/base commit, and stop additional implementation until the organizer confirms downloading it.
