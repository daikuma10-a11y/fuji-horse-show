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

## Print checkpoint — 2026-10-11

- Added admin-only "確認用の精算書を印刷". Verifies admin session and rereads Winter masters and fee/payment history before building the print view. No write or settlement confirmation occurs on print/reprint; unsaved advance form values are not used and are preserved.
- Self-contained escaped HTML, no remote styles/images/fonts or credentials; Japanese A4 portrait, summary before details, only additional/change/withdrawal lines, repeating table headings and row-safe page breaks. Popups/read failures show an error rather than printing old/blank data.
- Clearly labelled 精算確認用（仮） with missing stall/other fees and extra payment limitation. No payment instructions or misleading receipt/success state.
- tests/winter-settlement-print.cjs passed: 41 lines present, malicious names escaped, Winter-only, no network assets/credentials, fresh reads without payment writes or draft reset.
- Generated HTML rendered with WeasyPrint and local Noto Japanese font for QA only: 4 long-name rows fit one A4 page; 41 long-name rows span three pages. Inspected all pages; no clipped rows/text, headings repeat. These are temporary fixtures, not customer invoices.
- TypeScript/build passed. Actual Safari/iPad/Canon TS8630 printing and credentialed admin operation remain unverified.
- Next: full initial invoice/ancillary fees, extra payments/corrections, server confirmation snapshot and public checkout. This print checkpoint does not complete those features.

## 2026-10-11 支払方法の保存（本部のみ）

- Winterの団体ごとに当日現金・後日振込と振込先を保存。既存 settlement_payment_instructions を Winter event ID で限定し、Autumn画面・データを変更しない。
- 管理者 app_metadata.role の既存RLSを使用。未設定はINSERT、更新は前回updated_atを条件とするPATCH。重複・同時更新・読戻し不一致は成功扱いにせず再読み込みを促す。現金を選ぶと以前の振込先はクリア。
- 確認用の仮精算書に保存済み支払方法・振込先のみを掲載。現金受領・入金保存・精算確定・領収書発行とは別で、残額は変化しない。再印刷は引き続き読取専用。
- 支払い予定の保存と振込先についてユニット検証、Winter隔離、権限拒否、衝突・読戻し不一致を検証。PostgRESTの日時表現（Z / +00:00）にも対応。
- 実DBの管理者保存・CAS更新・古い更新拒否・非管理者読取更新拒否をBEGIN/ROLLBACK内で検証。実団体の支払方法・入金状態は変更しない。型検査・ビルド成功。
- 残り：入厩などその他料金、追加分入金、金額訂正履歴、サーバー計算による最終精算スナップショットと再試行の重複防止、選手用の確定・保存済み再印刷。実際の管理者セッション・iPad・Canonでの操作確認は未実施。

## 2026-10-11 事前出番登録の団体が空になる場合の案内
- DB読取時点でWinter大会の団体・選手・参加チェックは0件。共通名簿のクラブ一覧と大会参加名簿は別。共通名簿があっても参加チェックの保存前は出番登録の団体候補にならない。
- 空の団体選択だけを表示せず、参加名簿への登録手順と「人馬名簿で参加人馬を選ぶ」ボタンを表示。団体に選手・馬のどちらかが不足する場合も案内。
- 本部内のタブ移動で未保存入力を保持し、参加チェック保存後に「出番登録へ戻る」で事前登録パネルを開いて戻れる。旧インライン本部画面も同じ導線に対応。
- 人馬を勝手に大会参加扱いにするDB変更は行わない。型検査・ビルドで確認。管理者による実参加選択・保存は利用者側で行う。

## 2026-10-11 追加・変更分の確認済み入金
- Winter本部の精算タブに、実際に確認した現金／銀行入金の記録と、誤入力の取消を追加。支払予定の選択・印刷だけでは入金にならない。事前入金との重複登録に注意する説明を表示。
- Winter専用append-only履歴に金額・方法・確認内容・記録日時・管理者IDを保存。直接INSERT/UPDATE/DELETEは許可せず、app_metadata.admin検証付きprivate関数をSECURITY INVOKERの公開RPCから呼ぶ。RLS読取も管理者限定。
- 登録番号と入力内容の一致で再試行を冪等化。取消は元の入金に1件のみ、同額同方法、取消の再取消は禁止。元記録は保持。通信／保存後読込が不明なら入力を固定して同じ番号で再確認。団体変更・履歴再読込・別フォーム保存を固定中は抑止。
- 保存済み追加分入金（取消差引）を競技料金の残額と仮精算書に反映。過入金は本部確認警告。事前明細は引き続き掲載せず、追加・変更・棄権だけを明細表示。
- DB検査 tests/winter-extra-payments-db.sql：保存と同番号再送、内容変更拒否、監査ID、取消と再送、二重取消・取消の再取消・直接更新・0円・Autumn団体・非管理者／匿名拒否。すべてBEGIN/ROLLBACK。実団体の入金は書き換えていない。
- 単体検査：通信結果消失／読込失敗後の同番号再確認、残額、取消整合性、過入金警告、大会隔離、印刷escape。型検査とNextビルド成功。iPad/Canonの実操作は未確認。
- 残り：入厩などその他料金、請求額訂正と履歴、サーバー計算による最終精算スナップショット、選手側確定と保存済み再印刷。現状は管理者の仮精算確認まで。

## 2026-10-11 馬匹登録料の自動集計
- 公開Winter申込書の申込集計書C6「14,000円×頭数」を確認し、1頭14,000円を設定。2026-10-11再取得のSHA256は04a60fd63f75f23d3eae5e19bfc37f950c14bba2bca34d93e563eba1f40e23a0で、前回取得原本と一致。
- 所属団体ごとの保存済み参加馬をhorse IDで一意に数える。共通名簿の全頭や競技数・騎乗選手数から数えない。同名別IDは別馬として保持。参加チェックがfalseの馬は除外。締切後に取り込む旧形式の参加馬は既存Winter参加判定を維持。
- 馬匹登録料は馬の所属に、競技料は選手の所属に計上。管理画面は対象頭数・単価・対象馬一覧と事前料金合計を表示。参加名簿保存後の再読込で更新し、印刷も最新の保存済み参加名簿を読み直す。
- 残額＝事前競技料＋馬匹登録料＋反映済追加変更料－確認済事前入金－確認済追加分入金（取消差引）。事前入金の過入金判定も競技料＋馬匹登録料に更新。元の事前入金を再登録する必要はない。
- 仮精算書に「馬匹登録料：頭数×14,000円＝金額」と事前料金合計を追加。事前競技明細は掲載しない。
- tests/winter-horse-registration.cjs：所属別、参加済のみ、同ID重複排除、同名別馬保持、参加チェック変更、他大会・矛盾重複拒否。精算テストで別所属騎乗時の馬／選手請求先分離、合算残額を確認。印刷テスト、型検査、Nextビルド成功。実名簿・入金の書込なし。実機印刷確認は未実施。
- まだ精算確認用（仮）。その他料金・請求額訂正・選手側の最終精算保存と再印刷は別途実装。

## 2026-10-11 本部の請求金額訂正
- 請求を増やす／減らす差額と理由を管理者限定で保存。競技料、馬匹登録料、入金履歴を上書きしない。逆方向の差額で訂正を戻す。
- DBが競技料・参加馬14,000円・反映済申請・累積訂正から請求総額を再計算し、画面確認額／最新訂正IDと一致するときだけ保存。古い画面の上書き、負の請求額、同番号の内容変更を拒否。
- append-only履歴に訂正前後の総額・差額・理由・管理者ID・日時を保持。直接書込不可、読取/RPCも管理者限定。通信結果不明は同番号同内容で再確認。
- 管理画面・仮精算書に訂正合計と請求総額、訂正内容を反映。印刷は保存済み内容だけを読み直す。
- DB検査はBEGIN/ROLLBACK内で監査・再送・古い訂正/料金拒否・逆差額・0円未満/直接更新/非管理者拒否を確認。精算/印刷単体検査、型検査、ビルド成功。実入金・請求額は変更していない。

## 2026-10-11 Winter受付iPadの精算保存・印刷
- 受付最下部の精算を /winter/settlement に接続。管理者ログイン不要で団体を選択し、残額・追加変更棄権明細・訂正を確認、確認者名と現金／後日振込（残額0円は支払なし）を保存して印刷する。
- Winter専用Edge Function winter-self-settlementを新設。既存Autumn関数は変更せず、既存Nextサーバー用proxy認証を使用。proxy資格情報やservice keyはブラウザーに送らない。端末tokenはWinter専用HttpOnly/SameSite/12時間Cookie。Edgeはproxy hashによる独自認証後のみservice RPCを呼ぶ。
- DBのSTABLE関数が1つの読取スナップショットで料金・参加馬・反映済申請・入金・訂正を再集計。ブラウザーから金額を受け取らない。内容hashが確認画面と変われば保存拒否。事前入金未確認／未反映申請／料金履歴不明／過入金は本部確認が必要。
- Winter専用確認テーブルに金額・明細・支払方法・確認者名を保存。同一登録番号は同じ結果、同一団体/内容versionも1件。別方法で保存済みなら本部対応。現金・振込を選ぶだけでは入金額を変更しない。入金確認と金額修正は引き続き本部専用。
- 保存後の再印刷は保存済みスナップショットを使用し、保存POSTを実行しない。保存後に料金が変わった場合、当時の再印刷と現在の再精算を区別。事前エントリー明細は省略し、馬匹登録料頭数・合計と追加変更棄権明細・訂正内容を掲載。
- 元のAutumn大会・テスト版・認証・DB操作は変更しない。自動の無音印刷は行わずiPadの標準印刷画面を使用する。
- tests/winter-self-settlement-db.sql：サーバー計算、保存スナップショット、同番号／同版の重複防止、訂正によるversion変更、古い版/無効端末/振込先未設定/匿名/ブラウザー直接RPC拒否、保存によって入金が増えないことを確認。すべてROLLBACK。実団体の精算確認は作っていない。
- tests/winter-checkout-route.cjs：Winter専用接続、Cookie、同一origin、金額引数無視、不確定と古い内容エラー区別。winter-checkout.cjs：金額/大会/団体検証、保存済み印刷escape、現金を入金にしない、0円、再印刷でPOSTしない。既存精算・印刷・馬匹登録料テスト、型検査、ビルド成功。
- 公開後にサーバー接続を確認する。iPad/Canonの実印刷確認は主催者側で必要。正式申込書一括取込、精算だけの事後登録などは別の残作業。

### Winter公開接続設定（2026-10-11）
初回PreviewのGETで接続キー未設定を検出。Autumn用キーの流用を止め、`WINTER_SELF_SETTLEMENT_PROXY_SECRET` を `prep/winter-2026` のPreview限定・Sensitiveで追加。Winter Edgeは専用キーのSHA256のみ保持し、Autumn EdgeとProduction設定は変更しない。APIのスコープCookieとWinter固定大会IDは維持。秘密値はGitへ保存しない。

## 2026-10-12 本部の保存済み精算書確認
- 公開Previewの精算GETは200、Winter大会ID一致、参加馬9頭・単価14,000円、専用Cookieを確認済み。実団体の確認済み精算・請求訂正は0件。事前入金未確認の警告を維持し、確認を勝手に保存しない。
- 本部精算タブに団体ごとの保存済み精算書（新しい順に20件）を追加。当時の金額・確認者・支払方法・保存番号を表示し、そのスナップショットを読取専用で再印刷。管理者セッションを検証し、RLS・Winter大会・団体フィルターを使用。端末トークンは取得しない。
- 入金・支払方法の保存中は団体切替、競合する金額操作、精算再読込・仮印刷を抑止。
- tests/winter-saved-settlements.cjsで権限拒否、他団体・他大会拒否、トークン除外、書込なしを確認。保存済み印刷検証・型検査・Nextビルド成功。実管理者ログイン・iPad/Canonの実操作は利用者確認が必要。

## 2026-10-12 現場追加・再走行の精算だけの登録
- 本部「事後登録」に馬の所属→馬→競技・騎乗選手の一括入力を追加。1〜100件を同時保存。現場追加・再走行は既存の出番の有無にかかわらず別登録番号で記録でき、出番表と受付申請は変更しない。
- 料金は保存時にWinter競技マスターの会員/非会員・OP・指導者資格・公認登録を再検証し、競技料＋追加手数料3,000円を保存。馬の選択団体と騎乗選手の請求先を区別。参加チェック済み人馬のみ。
- 新規append-only fhs_winter_settlement_onlyと管理者検証付きprivate RPC、SECURITY INVOKER公開ラッパー。テーブル直接書込・匿名・非管理者は不可。安定IDで再送、入力変更拒否、全件成功または全件未保存。読戻し照合が不明なら同じ一覧で再確認。
- 本部精算に現場追加履歴と理由付き取消を追加。元記録は残し、取消は同額の差引履歴を一度だけ保存。取消の取消は不可。入金・元の出番は変更しない。
- 本部集計・請求訂正RPC・サーバー精算スナップショット・保存済み精算書に現場分を統合。取消差引、現場追加明細、版変更を反映。過入金の返金/充当は本部確認を維持。
- DBテストはBEGIN/ROLLBACKで複数所属・全件保存と再試行・全件ロールバック・会員/非会員/OP/資格・取消/二重取消・監査/権限・出番表/申請/入金不変・サーバー集計・現場分を含む金額訂正を確認。現場登録実データは0件。
- 全40競技区分の料金単体検査、保存読戻しと不確定/料金変更の区別、請求先分離、取消集計、既存事前登録/精算/印刷検査、型検査・Nextビルド成功。新規現場テーブルにsecurity advisor警告なし。
- 現場の変更・棄権を精算だけに記録する専用操作、打ち合わせ会一括確定、正式Excel取込、実管理者/iPad/Canonでの通し操作は残る。通常の追加・変更・棄権受付は既存の出番表反映の流れを維持。
- 取消時には現在の請求総額をDBで再計算し、割引等によって取消後の請求が負になる場合は拒否。訂正を戻してから取消する流れをDBテストで確認。公開Previewの本部ページと現場入力コード、選手精算API/団体別集計は200を確認。実機ログイン後の入力・印刷は未検証。
