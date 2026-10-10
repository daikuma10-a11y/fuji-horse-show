# Winter settlement checkpoint — 2026-10-11

## Completed

- Winter administration Settlement tab now reads the Winter initial-entry fee ledger and reception request history; organization choices use the shared reading order.
- Initial fees use saved category/OP prices, never current master prices or Autumn fixtures. Only reflected requests are charged; pending requests are flagged, cancelled requests excluded, withdrawal application fee must be zero. Original initial charges remain after withdrawal.
- Displays initial competition fees as a total only; additional/change/withdrawal details show competition/rider/horse and before→after for changes.
- Admin can save the **absolute confirmed initial-entry advance payment**, with note. This does not represent additional payments, receipt issuance, settlement confirmation or a final invoice.
- Existing admin-only settlement_prepayments table reused with hard Winter filters; no schema migration, production release or real participant/payment fixtures created.
- New records use INSERT, not merge/upsert. Existing records use event/org/expected updated_at PATCH. Conflicts cannot silently overwrite another operator. The saved row is checked and read back; uncertain saves require reloading before another attempt.
- Unknown charge histories and overpayments are flagged; no automatic presumption that initial entries were paid.

## Verification

- tests/winter-settlement.cjs: saved category prices, reflected-only sums, pending/cancelled exclusion, zero withdrawals/no original-fee refund, advances, missing-source warning, event isolation, optimistic save and read-back.
- tests/winter-settlement-db.sql on actual project: admin INSERT/UPDATE/read-back, stale PATCH equivalent returns zero rows, nonadmin SELECT/UPDATE blocked; transaction fixtures rolled back.
- winter-data, winter-event, winter-initial-entry tests, TypeScript and Next build passed.
- Credentialed browser operation has not been performed. No admin password/session is available to the agent. Do not describe this as an end-to-end ready self-checkout.

## Next checkpoint

1. Model full initial invoice (stall/other charges) and extra payments without duplicating initial ledger amounts; admin amount corrections with audit and concurrency.
2. Winter-only server-calculated settlement confirmation snapshot and payment method, idempotent retries and read-back; choosing cash is not proof of payment.
3. Public self-checkout route, receipt/printing of saved snapshot; print retries must not create another confirmation.
4. Keep initial details omitted; summary followed by only additions/changes/withdrawals. Verify page breaks on iPad/Canon TS8630.
5. Meeting-specific pending/batch confirmation and formal Excel import still separate remaining tasks.

Continue on prep/winter-2026, commit/push each completed checkpoint. Autumn fhsfix.vercel.app stays untouched.
