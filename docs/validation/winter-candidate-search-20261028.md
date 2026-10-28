# Candidate lookup and amount-field explanation — 2026-10-28

Excel review previously offered existing identities only by number, exact normalized name, or exact normalized reading. A middle dot or long-vowel spelling difference could therefore hide a previously registered horse, even with a manually selected "new" registration choice.

Candidate presentation now also searches kana/width variants, punctuation and long-vowel variants, and partial names/readings. A separate per-row search input accepts part of a name or a registration number without changing the submitted name. Automatic suggestions and search results are deduplicated, number matches rank ahead of name suggestions, and an explicitly selected identity stays available. Candidates are shown with their matching reason, number and affiliation; if no existing identity is selected, a visible yellow notice lists the candidates, including when the saved choice was "new". Searches use the already loaded roster and do not issue requests per keystroke. Archived identities and the other entity kind are excluded.

Loose normalization is for candidate discovery only. The original strict duplicate check and identity validation remain separate; partial matches do not merge or bind identities, rewrite names, or prevent two different horses with related names from being registered. Existing-name corrections still require an explicit identity selection and the established roster preparation/registration flow. The source application, entry keys, retry IDs and amounts remain unchanged by searching. No new draft-schema fields are required.

The amount comparison now explains all three columns. "原本確認後の値" is an editable reviewed claim amount, entered after checking riders, competitions, OP/member categories and horse counts. The original saved workbook amounts stay visible. Missing entries should be corrected first; confirmed application total/formula errors can be corrected in this field. Count edits do not automatically rewrite the amount fields or original Excel. Settlement charges still come from registered entries and horse registration fees, and payment posting is separate. The difference column displays the direction and size of each amount discrepancy.

## Validation

- Sixteen targeted standalone synthetic modules passed, covering candidate search, importer/controller rendering, source/checkpoint preservation, count reconciliation, roster preparation, registration/resume and the existing service guards.
- Examples include `ハリーポッターD`, `ハリーポッター`, `ハリー`, hiragana/half-width input, and registered names with middle dots or omitted long vowels. Different horses, clubs, entity kinds and archived rows remain distinct.
- A synthetic component flow verifies automatic suggestions, a visible notice while "new" is selected, search without source/name/confirmation mutation or requests, and number copying only after explicit candidate selection.
- The sixty-entry table regression checks the explanatory copy, the 12,000-yen difference display, existing edit callbacks, busy/frozen guards and responsive table structure.
- Standalone TypeScript validation and optimized Next.js webpack build passed. The local shared dependency symlink requires webpack; deployment configuration was not changed.

The UI and search normalization are in shared master code. Winter currently owns this Excel adapter; no new Autumn Excel migration is claimed. No live roster, application, entry, claim, payment or settlement was changed. Tests use synthetic data and component rendering, not an authenticated operator browser. The screenshots establish a 12,000-yen difference but do not establish its cause or authorize changing actual financial records.
