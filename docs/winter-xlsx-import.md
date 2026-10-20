# Winter Excel import — checkpoint 1 (not released)

This checkpoint implements value extraction and pure review helpers only. It is not connected to the admin UI or database. No participant registration or payment operation has been performed. The existing CSV/TSV registration flow remains unchanged.

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

## Remaining implementation

- Add master preregistration Excel tab and original/edited side-by-side controls.
- Explicit database identity binding and safe new-person registration through existing roster functions.
- Preserve a versioned checkpoint before every save; unknown outcome must stop new-person resubmission until checked against actual roster.
- Connect participant union and existing one-entry-at-a-time import registration, retaining retry IDs.
- Revision diff review and safeguards after partial registration.
- Targeted orchestration/component tests, production build and real-screen checks.

The synthetic test fixture is authored for this change and contains no original workbook bytes, real participants, contact details or bank instructions. `node tests/winter-application.cjs` tests extraction, copied/hidden sheets, unresolved names, fee and payment separation, revision comparison and input guards. UI, database saving, full Excel format compatibility and end-to-end import are not yet verified.
