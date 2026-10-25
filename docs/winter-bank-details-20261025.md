# Winter 2026 payment destination

The official Winter guidelines (page 2), checked on 2026-10-25, specify:

- 静岡銀行 御殿場西支店
- 普通 0110546
- フジホースショー事務局 川口 雅美
- Source: https://www.fujifarm.jp/data_files/view/516/mode:inline/26winter%E8%A6%81%E9%A0%85.pdf

Use the existing Winter configuration as the default payment destination. Live settlement accounts include the destination even when no organization-specific payment instruction exists. The payment form starts with this destination; existing explicit instructions remain intact. Confirmation snapshots store the effective destination, so reprints keep the account details saved at confirmation. Legacy snapshots keep their original instruction rather than receiving today's default.

The database migration only replaces the two existing Winter internal function bodies. Relative to the retrieved deployed definitions, it adds the destination to the calculated account and changes the bank-presence check to read that field. It does not select payment methods, record payments, alter financial totals, or change permissions.

Validation before release:

- TypeScript check and Next.js production build passed.
- Winter payment instruction, calculation, saved-record and print regression tests passed.
- Checkout interaction tests passed for cash and bank transfer, including retries and reprints.
- Existing Autumn screen/print markup test passed unchanged.
- Migration and settlement confirmation SQL tested together in a rolled-back transaction: official destination saved in the snapshot, repeated submissions idempotent, prior snapshots unchanged, stale versions and unauthorized calls rejected.

Release target: `prep/winter-2026`; no Autumn production deployment.
