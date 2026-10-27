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

## 追補：騎乗者資格とカナ馬名の読みの自動補完（2026-10-23）

Excel読込時、フリガナが空欄で馬名がカタカナ・ひらがなだけの場合は、馬名を確認用の読みに補完する。長音・中点・空白を許容し、半角カナは全角に正規化する。漢字・英字・数字を含む名前は推測しない。記入済み・手で訂正した読みは保持し、Excel原本の空欄もそのまま残す。

騎乗者資格は、申込書にある日馬連番号に限定して既存の日馬連マスターをGETする。番号と氏名の対応が一致し、最新取得日の記録が一致する場合にA・B・C級を補完し、取得日と番号を表示する。手で訂正した資格は再読込でも保持する。限定資格・矛盾・空欄は通常の資格に置き換えず、確認理由を表示する。未取得を「未登録」とは判断しない。原本と訂正値を分け、資格保存時の出所にも取得日を残す。確定済みの再開記録は変更しない。

### 実データの状況

読み取り専用の確認で、既存の `jef_rider_master` に必要な列があることと、保存件数が0件であることを確認した。日馬連公式会員検索には所有資格があるが、直接取得はHTTP 403となり、代替経路による回避は行っていない。共有済みファイルからも資格データ原本は見つからなかった。したがって資格補完の処理は実装したが、実在の申込選手への自動入力には資格を含む元データの受け渡し・取込が必要であり、未検証である。日馬連マスターやDBスキーマ・権限への変更は行っていない。

### 検証

- 合成データでカナ馬名、半角、混在文字、明示された読みの保持、馬名変更後の再補完、原本保持を確認。
- 番号・氏名一致、最新取得日、同日矛盾、限定資格、空欄、番号変更、手動訂正保持、旧JSON互換と出所の復元を確認。
- 実コンポーネントの読込・訂正・再照合イベントで自動入力と訂正保持を確認。この確認では登録要求を行わない。
- サービスの認証・番号限定・読み取り専用GET・不正応答・取得失敗を確認。
- autofill、service、review/registration component、draft、Excel抽出、credential、registration coreの関連試験、TypeScript型検査、webpackビルド24ページ、diff検査を通過。Autumn精算の既存HTML比較も通過。

中立の補完規則と表示は共通マスターに置き、データ取得の呼出しはWinter取込に限定する。実申込書での資格補完・登録は未実施。原本・個人情報・画像・認証情報は保存コードに含めない。

## 訂正：保存済み日馬連データの発見と取込準備（2026-10-23）

前項の「原本が見つからない」は検索不足だった。利用者の指摘により以前の作業を照合し、2026-10-04取得済みの原本ZIPを再取得できた。DBの件数0と、保存原本の有無を混同した点を訂正する。新たな公式サイトの取得や制限回避は行っていない。

- 原本：`日馬連_人馬データ_20261004.zip`、1,642,237 bytes。保存時のSHA-256 `a7d0ad6133c52825048a61aadebc4ffc1e70fc85fd1b23b14a5da97dc3780689` と再取得後が一致。
- 現年度公開検索の取得日スナップショット：選手5,710件・馬3,624件。過去年度・失効者を含む歴史全件ではなく、2026-10-23の最新データとも表示しない。
- 原本内の会員検索結果に所有資格、乗馬検索結果にグレードがある。番号・正式名・公開フリガナを原本と保存済み辞書の両方で照合。限定資格は原文を保持し、空欄や「-」を資格なしと決めつけない。
- 参照用JSONを別途保存：`jef-master-data-20261004.json`、4,697,353 bytes、SHA-256 `1edaf619cd713e58580f09aad2fd356f71cf03c122baac1901db678b943200e9`。生年月日等を追加せず、番号・名前・読み・資格/グレード・出典・取得日を持つ。元の全項目は既存原本ZIPに保持。
- `FHS申込書アップグレード試作版.xlsx` の日馬連2シートとも全9,334件を比較し、番号・正式名・公開フリガナ・資格/グレードの不一致0件。
- `scripts/prepare-jef-master.py` は原本ハッシュ・件数・番号重複・名前/読み・出典/取得日を検証する。ネットワークやDBへの書込みはない。合成試験と全件照合を通過。

### アプリへの取込はアクセス設定の承認待ち

既存2表は空で、RLSが無効、anon/authenticatedにSELECTだけでなくINSERT/UPDATE/DELETE/TRUNCATE等の権限がある。資格補完の参照元を未ログインでも書き換えられる設定なので、そのまま実データを入れる処理は行わない。

変更案は `docs/proposals/jef-master-access.sql`。日馬連マスター2表だけRLSを有効にし、既存Winterと同じサーバー管理のapp_metadataによる管理者SELECTを許可する。ブラウザーからの直接書込みは許可せず、承認済み原本の取込だけバックエンドから行う。アカウントの役割、既存人馬・出番・精算・Autumnの表、既存の別ポリシーは変更しない。SQLは案として保存しただけで未適用・未検証。取込時には最新・同日行を読み、既存値と衝突する場合は上書きせず停止する。

今回、データの発見・保存・検証と取込準備まで完了。DB書込み・権限変更・実申込者の登録は実行していない。原本と参照用JSONは非公開の保存ファイルに置き、GitHubには変換コード・試験・件数/ハッシュ・変更案のみを含める。


## 承認後：日馬連マスターの保護・取込完了（2026-10-24）

利用者の承認後、日馬連マスター2表に限定してアクセス設定を適用し、保存済み2026-10-04原本を取り込んだ。前項の「承認待ち・0件」は取込前の記録であり、現在は以下の状態。

- 適用済みmigrationは `20261024002951_protect_jef_master_lookup.sql`。Supabaseのmigration履歴から実際の版番号を取得し、適用したSQLと同一のファイルを保存した。
- 2表のRLSを有効化し、PUBLIC/anon/authenticatedの従来権限を取り消した。authenticatedにはSELECTのみ付与し、サーバー管理のapp_metadata.role=adminとauth.uid()がある場合に限るポリシーを設定。service_roleの既存権限は維持した。アカウントや役割の変更はない。
- `tests/jef-master-access.sql` をトランザクション内で実行。未ログインの読取拒否、一般利用者・user_metadata.role偽装による読取拒否、管理者の読取成功、ブラウザー利用者の直接INSERT/UPDATE/DELETE/TRUNCATE等の権限なしを確認。合成行はすべてROLLBACK。
- `scripts/jef-master-import-sql.py` で原本JSONのSHA-256を検証し、500件以下の20バッチを順に取込。日付と番号で同一行を確認し、一致行はスキップ、不一致行は当該バッチを停止する。UPDATE/DELETEは行わず、別日付の履歴も巻き戻さない。
- 選手5,710件、馬3,624件を保存。番号・名前・資格/グレード・公開読み・出典URL・取得日・原本ハッシュの全項目を、DB読戻しと原本からそれぞれ計算したSHA-256で全件照合した。余分なraw_data項目、欠損項目とも0件。
- 先頭500選手の同一バッチ再送後も選手5,710件で、重複追加なし。限定資格1,059件と資格空欄698件は原本の情報を保持し、通常のA/B/C級へ変換していない。

### 全件照合の記録

`scripts/jef-master-verify.py` は番号のUTF-8バイト順、取得日の順に並べ、固定9項目を「UTF-8バイト長:値」（NULLは-1:）で連結してハッシュ化する。生成SQLはSELECTのみで、個人別の行を検証記録へ出力しない。

| 対象 | 件数 | 原本とDBで一致したSHA-256 |
| --- | ---: | --- |
| jef_rider_master | 5,710 | ab012a3ed98732b81dd3baf38e2150e2dc3bf1107a48a64a11ff21c76935d3fd |
| jef_horse_master | 3,624 | 0e6ac069d74c659c6e4267b191875d9bdacfe06a5d97925a158580f82051c469 |

全件の最古・最新取得日はともに2026-10-04。10月24日時点の最新公式データとは扱わない。security advisorsは56件から54件になり、減少分は今回の2表のRLS未設定だけ。新規指摘0件、その他の指摘・設定は変更していない。

### 自動補完と画面確認の範囲

- 全5,710選手を既存の資格補完関数で照合し、通常のA/B/C級3,953件は一致、限定資格・空欄1,757件は手動確認に残ることを検証。
- カナ馬名補完、番号/氏名一致、日付・矛盾・限定資格・手動訂正保持・原本保持・認証付き番号限定GETの既存試験を再実行して成功。原本変換の4試験、取込SQL生成の2試験、diff検査も成功。
- 利用者のChromeに接続し、開いていたWinter取込の下書きを読取。「既存登録を再確認」の成功表示まで確認したが、既存タブには更新前の表示が残り、最新版での資格補完表示は確認できていない。
- 下書きを保持して別タブで最新版を確認するため、確認再開JSONのダウンロードを開始する操作を試みたところでブラウザー接続が中断。ダウンロード完了・別タブ復元・最新版画面での自動補完は未確認。原本の読込・登録確定・実申込内容の書込みはしていない。

今回のDB書込みは日馬連参照マスター2表への承認済み原本取込のみ。既存人馬・出番・請求・入金・Autumn・他の権限は変更していない。実データファイルはGitHubに含めず、専用ブランチには適用SQL・取込/照合コード・試験・この検証記録を保存する。PR6のマージは行わない。
