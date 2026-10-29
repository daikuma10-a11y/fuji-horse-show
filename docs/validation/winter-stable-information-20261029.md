# Winter 入厩情報・印刷帳票（2026-10-29）

## Result

- Winter admin adds 入厩情報, with 入厩チェックリスト, 手帳チェック, 未精算リスト and empty 厩舎配置図 / 出店配置図 sections for future supplied documents.
- Deep link: `/winter/admin#winter-stable-information`.
- Shared rendering/printing lives in `components/master` and `lib/master`; Winter adapters supply event-validated data. Autumn navigation and data are unchanged.
- Checklist: A4 landscape, two club cards side by side, 16 horses per card (two columns of eight), checkbox/name/blank remarks, large club and headcount, pickup and veterinarian signatures. More than 16 horses continue onto further cards; names shrink to fit on one line without truncation. No date fields or checklist title on the printed cards.
- Checklist and booklet scope is saved participating horses, including reserves without entries and withdrawn horses still marked as participants. Multiple competitions do not duplicate a horse; distinct IDs with equal names stay distinct.
- Booklet report follows the supplied sample columns: No., club, received date, horse count, arrival, departure, returned date, remarks. Club/count are automatic. Receipt/return dates and arrival/departure times have no existing saved source in the application, so remain blank for handwriting; no sample 2025 dates or registrations are imported.
- Unsettled report follows check/club/amount/remarks. It uses `winterSettlementAccount`, including saved entry fees, horse fees, reflected requests, adjustments, confirmed payments and reversals. Paid clubs without warnings disappear. Unknown fee history, pending requests, missing advance confirmation and overpayments remain visible for review. Unknown/refund amounts are not presented as a collectible amount. Choosing a payment method alone does not mark payment received.
- Every print re-reads saved data. Settlement reads use the existing admin authorization. Failed reads disable printing and do not produce a zero balance. Print dialogs open synchronously for iPad Safari, with preparation/success/error feedback and double-click prevention. Printing does not save receipts, change money, alter participation, or write registration data.
- New reports print A4 portrait with table headers repeated by the browser on further pages. The existing synthetic checklist PDF builder is updated to the approved two-up layout with measured single-line text fitting.

## Validation

Passed locally:

- `node tests/winter-stable-information.cjs`: participant scope, ID separation, event guards, 16/17-horse pagination, escaping, measured name fitting, disabled loading/error states.
- `node tests/winter-stable-reports.cjs`: booklet counts/blank dates, paid exclusion, payment-plan semantics, payments/reversals/adjustments, missing history, overpayment and pending request visibility, event guards, escaping and read-only projections.
- `node tests/winter-settlement.cjs` and `node tests/winter-horse-registration.cjs`: existing billing calculation coverage.
- `node tests/winter-reading-list.cjs`, `node tests/winter-registration-overview.cjs`, `node tests/winter-start-list-layout.cjs`: related registration/print flows and shared Autumn/Winter start-list compatibility.
- `node node_modules/typescript/bin/tsc --noEmit`.
- `node node_modules/next/dist/bin/next build --webpack`: all 26 routes generated.
- `git diff --check`.
- Updated checklist PDF rendered with Poppler and visually inspected. One A4 landscape page, 16/5 sample horses, complete names, remarks and signature lines, no removed date/header text.

## Limits

The connected-browser test could not start because originating browser context was unavailable. The cloud browser cannot reach the local workspace server. No authenticated live data, real iPad print dialog, or physical printer was exercised; actual print output still requires the organizer's printer test. No live financial or registration data was mutated. No database migration and no Autumn production deployment are part of this change. New neutral components are reusable, but this does not claim migration of unrelated legacy screens.
