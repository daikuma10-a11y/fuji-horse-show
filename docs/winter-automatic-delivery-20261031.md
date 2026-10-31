# Winter 自動送信・本部受信確認（2026-10-31）

## 承認と対象

利用者は「iPadはお客さんが操作し、本部がほとんど触らないため手動送信では気づかない」と指摘。保存完了分の自動送信、復旧後の再開、要確認分も本部へ届けること、本部PCの未反映・要確認表示を提案。非公開の受信保管と権限制御を追加する理由・影響を説明して事前確認し、「お願いします」と承認された。

基準はPR #26通常マージ `655c0cd4df9a60d8725343426a7b3a79071c0d8e`。既存の端末保存、共通受付フォーム、料金計算、既存申請一覧、反映・精算・入金を再利用する。main `a44b46421f3d094209c61bc32d03918c9b4fff7a` とAutumn本番は対象外。

## 実装とDB

- 保存完了したIndexedDB受付のみを自動送信。入力中のlocalStorageキューを読み取らない。同時送信を集約し、送信前に番号・内容を固定、CASで書込・読戻し確認。通信復旧・画面復帰と再試行タイマーで再開する。
- 既存のHttpOnly/SameSite cookie、同一Origin検査、サーバー側proxy認証を再利用。管理者トークンは不要。Next側でdraftとitem・金額・番号を照合する。
- 既存の `submit_winter_offline_item` の処理本体は、権限入口以外を同一のままprivate関数へ移した。以前の管理者RPC入口は維持。新しいservice専用入口は有効なdevice tokenを再確認する。
- `fhs_winter_internal.received_reception` はWinter固定、RLS有効、PUBLIC/anon/authenticated/service_roleから直接テーブル操作不可。管理者専用RPCで一覧・件数・訂正を行い、app_metadataのadmin権限を毎回検査する。
- 元の受信内容を保持して既存業務検証へ渡す。業務条件が変わっていれば受信記録を要確認として残し、部分的な申請書込はロールバックする。正常分だけpending申請となり、出番反映は行わない。
- 申請ID単位の既存advisory lockを共用。元の受付番号・入力・金額が同一なら再送は同じ結果を返す。訂正は別の操作IDとrevisionで管理し、同じ操作IDの違う内容・競合更新を拒否する。受信元の記録は書換えない。
- 本部PCの全タブに未反映／要確認件数を表示。受信確認と訂正は申請一覧内で行う。既存の訂正フォームと団体別申請一覧を再利用する。

読み取りで既存migrationと4関数のsource hash・Edge v4の内容を照合し、未適用を確認してから一度だけ追加した。

- 新migration：`20261031055626_winter_automatic_delivery`。Supabase管理APIが採番した適用versionと同名で正本SQLを保存。CLI導入が環境ネットワークで完了しなかったため管理APIを使用し、独自の適用時刻を捏造していない。
- 旧 `winter_offline_reception` の適用版20261030082125は再適用していない。
- Winter専用Edge `winter-self-settlement` v4→v5。追加は既存token検査の後に置いた `reception-offline` actionのみ。既存proxyハッシュ認証、verify_jwt=false、他actionは維持。

## 検証結果

- `tests/winter-automatic-delivery.cjs`：実際のAPI route、IndexedDB保存・読戻しとReact componentを使用。追加・変更・棄権、入力途中の非送信、Origin/cookie/本文照合、管理者資格不要、送信前／後切断の同一再送、重複呼出し集約、誤った応答を成功扱いしないこと、要確認引渡し後の再送停止、通信復旧／画面復帰の自動再開、個人名を含まない状態表示を確認。合成HTTP/DOMであり実iPadではない。
- `tests/winter-headquarters-delivery.cjs`：実管理画面・通知・要確認一覧・共通訂正フォーム・既存申請一覧を使用。他タブでの件数表示、取得失敗時の前回値保持、要確認の登録、保存後の応答消失、訂正内容・操作IDを固定した再確認、既存申請一覧への更新を確認。出番反映・精算・入金への呼出しなし。
- `tests/winter-public-reception-route.cjs`：proxy関数の共通化に伴う既存オンライン経路の接続確認。cookie更新・Origin・名前・重複ID・確定応答・不確定結果を確認。無関係な機能全体は再試験していない。
- `tests/winter-delivery-edge.cjs`：実Edgeソースでproxy秘密検査、token形式／期限、受信RPC転送、tokenのハッシュ化、従来のreception-confirm経路保持を確認。テスト用秘密digestとHTTPを模擬。
- `tests/winter-automatic-delivery-db.sql`：適用済みDBで合成fixtureを一つのトランザクションに作り全体rollback。ACLと匿名／偽admin拒否、期限切れ端末拒否、3種のpending登録、同一再送、内容不一致拒否、料金差分・重複対象の要確認保管、管理者訂正／取下げと再試行、元内容保持、出番非反映を確認。最初の試験SQLに変数sourceと列sourceの曖昧参照があり試験が中断したため、列を修飾して修正後に合格。migrationの再適用はしていない。
- DB試験前後の全行数・内容指紋が一致：organizations54、riders244、horses152、entries584、reception_requests148、および精算・入金関連11テーブル。実参加データ・実入金を変更していない。
- security advisorの新規指摘はprivate受信表の「RLS有効・policyなし」INFOと管理者RPC3個のauthenticated SECURITY DEFINER警告。前者は直接アクセス拒否の設計、後者は関数内admin検証・固定search_path・明示grantで制限し、拒否試験済み。既存の他テーブル／関数の指摘は変更していない。
- TypeScript型検査と `git diff --check`。PR #23〜#26の有効な保存・Worker・自動準備・UI検証は継承。管理試験①②③を繰り返さない。

## 配備・未判定

GitHub取り込み前にbase/head/競合/配備チェックを再確認し、prep/winter-2026へ通常マージする。Vercelの固定Winter URLとcommit/READY状態は対応PRの最終配備記録で照合する。

実機の自動送信と通信断中の移動、スリープ／再起動、送信途中切断は未判定。利用者が以前入力したテストを同じiPadで再利用する。入力途中であればそれ自体を自動確定せず、同じ内容を保存してから送信対象とする。今回の配備後に旧画面を更新すると、以前の保存完了分も自動送信対象となる。

元Workは保管・回収用のまま。本担当は別checkoutを使用。元Workの実行状態と未保存変更全体は未確認で、不存在とは判断しない。環境担当の回収結果を受領後に照合する。
