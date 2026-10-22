# Winter Excel import: guided review (2026-10-22)

## Scope

Based on `prep/winter-2026` at `12708d69d7685e430b7c546f619be9a8fcb61dcc`.
The organizer requested a flow understandable without an assistant: read the
application, review highlighted corrections, import, then open start lists and
settlement. Rendering remains in the shared master; Winter data and persistence
remain in the existing adapters. Autumn does not yet consume these Excel
components; this change does not claim a completed Autumn Excel migration.

## Behavior

- Four visible steps and a next-action prompt. Blocking issues link to their
  editable person, entry, amount, or payment field; advisory warnings stay distinct.
- Responsive review cards expose original Excel values and suggested existing
  identities. A candidate still requires explicit confirmation, including club.
- Reading Excel fetches existing roster and event data. Exact organization and
  participant matches show Winter registration immediately, including legacy event
  organizations. Similar spellings and duplicate clubs are blocked for resolution.
- Registered organizations require choosing initial/additional import or change/
  withdrawal. Initial/additional import uses the existing duplicate-aware service.
  Change/withdrawal saves the review locally and opens the existing administrative
  change flow. It does **not** automatically apply workbook revisions or delete
  entries omitted from a workbook. Comparison displays the candidate differences.
- New reviews receive `WINTER-2026-` plus 128 bits of the file digest. The same
  file bytes retain the same reference even after renaming; changed bytes receive
  a different reference. Existing saved references remain readable and unchanged.
- On the same browser/device, a known reference automatically reopens its stored
  registration checkpoint. Completion still requires a fresh authoritative read.
- The final summary distinguishes already-registered entries from new entries.
  Completion provides links to start lists and settlement. The separately confirmed
  payment remains a review record, never an automatic payment posting.
- Normal next-application navigation retains local records without requiring a
  JSON download. JSON tools remain under resume/export details for another device.
  Concurrent local record changes and storage failures still stop replacement.

## Validation

Passed locally:

- `tsc --noEmit` (separate check; the repository build configuration skips types).
- Draft, guide, review-component, registration-core, registration-component, and
  service-adapter test suites. Fixtures are synthetic and perform no real requests.
- New controller cases: registered-club purpose required at the actual save action;
  purpose changes invalidate confirmation; change navigation preserves local review;
  same-file automatic checkpoint reopening; advancing without a JSON download;
  local completion flags never substitute for server readback.
- Existing retry IDs, unknown-result handling, stop/resume, auth, fee, storage,
  event isolation, stale-checkpoint, and duplicate-registration tests remain passing.
- `next build --webpack`: all 24 pages generated. Default local Turbopack rejects
  this worktree's external `node_modules` symlink; no application configuration was
  changed to accommodate that local environment limitation.

No real workbook registration, payment posting, database migration, permission
change, production promotion, or Autumn deployment is part of this validation.
The organizer will reload a real application in the preview to verify usability.
Production data and applicant screenshots are not included in this change.

## Follow-up: settlement organization list

During the organizer's preview test, the organization list showed zero after an
Excel import. Source inspection found that the list rendered only `extraTotal`
(reception additions/changes). Excel entries use the initial-entry ledger, which
is included by the existing settlement account calculation in `normalTotal` and
`total`, but was omitted from the list's displayed amount.

The shared list now accepts optional balance data. Winter supplies the same
account totals used by its detail view: total charges, recorded payments, and
remaining balance. Account warnings appear next to the organization. Autumn's
existing adapter and rendered markup remain unchanged. This is a presentation
fix; no fee calculation, registration, payment, API or database code was changed.

Synthetic rendering tests exercise the actual Winter adapter and account
calculator: three initial entries totaling 31,000 and one participating horse
produce 45,000 in charges even with zero reception surcharges. Unrecorded,
partial, full and excess payments show their respective balances. Missing-fee
warnings remain visible. The existing exact-HTML Autumn regression check passes.
These figures are synthetic test expectations, not a verification of a real
organization's database balance.

Follow-up checks passed: `tsc --noEmit`, `tests/winter-settlement.cjs`,
`tests/master-admin-settlement.cjs`, `git diff --check`, and
`next build --webpack` (24 pages). No authenticated browser or live balance query
was available in this follow-up; verification covers source and synthetic data.

## Follow-up: organization registration overview

The organizer requested a settlement-style organization selector inside
pre-registration for inspecting saved people, horses and entries after Excel
import. A fourth optional section, `団体別の登録内容`, now opens a club list and
read-only detail. The detail includes participating riders and horses, JEF
numbers, affiliations, entry counts, and entries ordered by date and competition
with start order, OP and withdrawal status. A horse without entries remains
visible. Saved earlier/manual registrations and Excel imports appear together;
an unsaved workbook draft is not treated as a completed registration.

The Winter adapter projects the dashboard's existing event-scoped snapshot.
Exact IDs preserve same-name identities and other-club riders. It uses each
entry's recorded organization, with the established horse-organization fallback
for legacy entries. Withdrawn entries remain visible but are excluded from
active counts. Loading and errors hide stale details. The selected club survives
ordinary data refreshes, and switching sections keeps existing form inputs
mounted. `/winter/admin#winter-registration-overview` opens the section directly.

Rendering and neutral types are in the shared master. The section is optional:
the existing two- and three-section contracts remain intact, and Autumn does not
yet consume this overview. No additional API, database, registration, payment,
permission or storage operation was introduced.

Synthetic checks cover club isolation, same-name IDs, cross-club affiliations,
unentered horses, date/competition ordering, OP, withdrawal, empty/error/loading
states, club selection/back navigation, event/reference guards and unchanged
source data. Dashboard integration checks cover the deep link, section selection
and preserved Excel form. `tests/winter-registration-overview.cjs`,
`tests/winter-preregistration-components.cjs`, `tests/master-admin-settlement.cjs`
and `tsc --noEmit` pass. `next build --webpack` generates all 24 pages, and
`git diff --check` passes. The settlement suite also verifies unchanged Autumn
rendering. Authenticated browser inspection is not available for this addition;
the organizer can review the new section in the dedicated Winter preview.

## Follow-up: rider qualifications and horse grade declarations

The club detail now has `所有資格級` in the rider roster and `グレード宣言` in
the horse roster. A separate read-only loader runs only while the overview is
open, using the existing administrator session and bounded GET queries for the
current Winter participants. It selects only the number, grade and import date
from the existing JEF master tables. The latest record for an exact JEF number
is used; conflicting same-date records and missing/blank data remain unconfirmed.
No identity is matched by name, and no grade is inferred from entered classes.

When the JEF rider master has no record, an existing Winter ID bridge may supply
the rider's historical `autumn_player` source grade. This is explicitly labeled
`過去原本（Autumn・要確認）`, not treated as current JEF verification. Multiple
conflicting source grades remain unresolved. Loading, lookup failures and missing
data are distinguished; failed credential reads do not hide the saved club list.
No raw JEF master data, birth dates or unrelated identities are requested.

Read-only schema/data inspection found that the existing JEF master tables have
the required columns but currently contain no rows. Some shared roster source
records retain historical rider grades; horse grade declarations are not retained
by the current Excel import. Therefore the new horse column honestly shows
`未確認` until grade records are available. Display support does not imply that
missing grade data has been imported or saved. This change does not modify the
database, source records, permissions, eligibility checks or Excel save behavior.

Synthetic tests cover latest records, conflicting/blank/missing grades, strict
number/ID correspondence, historical provenance, request scoping, no mutations,
event/auth guards, display columns and the active-section loading gate. Live
inspection used only SELECT queries; no applicant data is included in this record.
Validation passed: credential-loader, registration-overview, pre-registration and
shared settlement component tests, `tsc --noEmit`, `git diff --check`, and
`next build --webpack` (24 pages). Authenticated browser rendering remains
unverified in this environment.


## 資格級・グレード宣言の保存（2026-10-22、承認後の追補）

利用者の追加承認に基づき、従来の「表示だけ・DB変更なし」から、Winter申込書で確認した資格・宣言の保存まで拡張した。既存の人馬、出番、請求、入金、日馬連マスターの更新は行わない。

- 標準原本を読み取り専用で確認。選手資格はE列、馬の宣言はC列の各馬ブロック最終行（C7、C10等）。「Ｓ・中Ａ・中Ｂ・中Ｃ・中Ｄ・未」は様式の初期表示なので未選択として扱う。
- 原本セルと訂正値を保持し、②で馬の宣言を確認できる。③で保存済みと今回の値を表示し、確定後に保存・読み戻しする。
- 出番がすべて登録済みでも資格・宣言だけ保存可能。空欄は既存値を消さず、資格やグレードを出場競技から推測しない。
- 旧版の完了記録がある同一Excelを読み直す場合、新たに対応した宣言欄を含む確認へ進む。旧確定記録は保持し、補完用資料番号を自動発行する。未完了の旧記録は元の再開経路を保つ。
- Winter固有の参加人馬・団体ID・既存受付IDを照合する。保存開始時の比較元を保持し、管理者確定後に他の操作で更新された場合は停止。再送は同じ保存番号を使い、古い保存要求が新しい宣言を巻き戻さない。
- 団体別一覧は「Winter申込書（管理者確認済み）」の値を優先する。公式資格の認定や日馬連マスター更新を意味しない。

### DBと権限の範囲

適用済みmigration: `20261022104650_winter_application_credentials.sql`。追加した履歴テーブルと現在値ビューはWinterイベント限定。既存テーブル・ポリシー・権限は変更しない。管理者だけがSELECT可能で、直接INSERT/UPDATE/DELETE権限は付与しない。公開RPCはinvoker、履歴の追記だけを行うprivate関数は空のsearch_path、明示的な管理者検証、明示的なEXECUTE制限を持つ。

CLIが未導入で、取得処理のネットワーク承認が成立しなかったため、接続済みSupabase MCPのmigration経路を使用した。SQLをBEGIN/ROLLBACK内で検証した後に一度適用し、サーバーのmigration履歴から実際の版番号を取得して同一SQLを保存した。架空のmigration番号は使用していない。

合成DB試験は `tests/winter-application-credentials.sql`。初回保存、更新、再送、古い再送、競合、別イベント、誤った人馬/団体、空欄、不正形式、非管理者、user_metadataによる偽装、RLSを確認し、全試験データをROLLBACKした。適用後の保存件数は0件。実申込者の資格・宣言は補完登録していない。security advisorsは変更前後56件で、この追加による新規指摘は0件。既存の指摘は今回の範囲外として変更しない。

### コード検証

- 資格・宣言、既存登録のみの補完、旧再開JSON互換、保存応答喪失後の読み戻し、旧版Excel再読込、古い再開の停止を合成データで確認。
- Excel抽出、draft、guide、review component、registration core/component、service adapter、資格表示、団体別一覧、事前登録、共通精算の関連試験。
- TypeScript型検査、webpackビルド24ページ、diff空白検査。
- 共通マスターに欄を追加し、Winterのデータ/保存アダプターに限定。Autumn精算の既存HTML比較は通過。

認証済みChromeを操作する機能はこのWorkに公開されていないため、実申込書のブラウザー上の再取込は未実施。利用者が専用Previewで原本を読み直し、②の資格・宣言、③の保存内容、事前登録の団体別一覧を確認する。実原本・画像・個人情報・認証情報はGitHubに含めない。PR6の専用ブランチのみ更新し、prep/winter-2026・main・Autumn本番は更新しない。

## 追補：Excel取込と出番変更の案内整理

「登録済みの内容を変更・取消する」を選ぶと、別の変更画面へ進むため③の取込は停止する設計だった。しかし選択後も「要確認」と表示し、同じ内容の選択肢と移動ボタンを併記していたため、入力を直してもエラーが消えないように見えた。資格級・グレード宣言の保存がExcel取込に含まれる説明も不足していた。

- 既存団体には「登録済みの出番を残して、このExcelを取り込む」の確認欄を一つ表示。新規・追加出番と資格級・グレード宣言の保存が対象と明示する。
- 出番の変更・取消は専用画面を開くボタン一つに集約。選択だけで取込を止める「変更モード」を廃止し、既存の変更手続き自体は維持する。
- 確認欄のチェックで該当警告と古い操作エラーを消し、解除時は照合結果と確定確認を無効にする。未確認のまま③の再照合から進めることも防ぐ。
- 合成データで実際の確認欄のイベントを通し、警告解除→③、確認解除後の登録拒否、変更画面への移動時の下書き保持・DB要求なしを確認。既存の同一Excel再開・資格だけ補完・重複登録防止試験も通過。
- review/registration component試験、Autumn精算HTML比較、TypeScript型検査、webpackビルド24ページ、diff検査を通過。

今回の変更は表示・操作案内と確認状態の制御のみ。DB・権限・保存処理・料金計算は変更していない。認証済み利用者Chromeでの操作は未実施。写真・原本・個人情報はコード保存に含めず、専用ブランチのPR6とPreviewだけを更新する。
