# Winterオフライン受付：公開可能な検証記録

対象：`prep/winter-2026`。実参加者・実受付内容・認証情報はこの記録に含めない。

## 実装と境界

- 既存の共通追加・変更・棄権フォーム、名簿、料金レビュー、申請ID、保留申請保存処理を再利用。
- イベント別IndexedDBに複数受付を保存。保存トランザクション完了後の読み戻し、更新番号による競合検出、入力欄リセット直前の中断からの回復。
- 受付時点の照合情報を申請と一緒に固定。後から準備を更新しても古い受付の基準を置き換えない。
- Winterの受付5画面とビルドの静的資産を明示準備。キャッシュ未完了／部分消失時に準備済みとしない。API・管理画面・精算・打ち合わせ会はオフライン画面キャッシュの対象外。
- 管理者が明示的に照合・送信。最新名簿・出番・区分・料金の照合と、DB内の行ロック下での再確認。未知の保存結果はID固定で再確認。
- 追加したRPCは既存管理者権限のみ。既存保留申請RPCを呼び出し、出番反映・入金処理は呼ばない。DBテーブル追加／認証緩和なし。
- 一般の受付画面に戻る際に当該端末の本部ログインを解除。管理画面を離れると端末受付一覧を閉じる。

## 実施済み

- TypeScript `tsc --noEmit`。
- Next.js production build（ローカルは共有node_modulesのシンボリックリンク制約があるためwebpack。Vercelの通常ビルドは別途記録）。
- `tests/winter-offline.cjs`：合成3団体の追加・変更・棄権、端末保管／読み戻し、保存直後の再開、容量不足、競合更新、送信前／保存後の応答消失、ID・料金重複防止、独立受付の進行、変更済み対象／重複対象の要確認、大会分離。
- `tests/winter-offline-worker.cjs`：完全準備後のみ有効化、オフラインHTML／資産取得、API等の除外、準備途中の失敗、部分キャッシュ消失、自動送信なし。Service Workerプロトコルの模擬試験。
- `tests/winter-offline-ui.cjs`：名前は最後に1回、通信なしの保存、保存後の入力欄クリア、再マウント後の前の人の非表示／次の受付。DOM模擬試験。
- 通常受付のUI・API、受付バッチ、共通フォーム、Autumn共通画面、打ち合わせ会、Winter料金・本部反映操作の既存回帰試験。
- `tests/winter-offline-db.sql` を接続先DBで実行：管理者限定、user_metadata偽装拒否、所属／料金／対象出番の照合、3種の保留申請保存、同じ受付・申請IDの再実行、異なる内容／受付番号の拒否、同じ出番の重複拒否、自動反映なし、明示的な既存反映後の再送で重複なし。合成fixtureはトランザクションをrollbackし、実参加記録の更新なし。
- Supabase security advisor確認。今回追加した関数の指摘なし。既存テーブル／ビュー等の指摘は今回変更しない（[RLS](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public)、[ビュー](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view)、[search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)）。

模擬試験用依存は `fake-indexeddb@6.2.4`、`jsdom@26.1.0`。別ディレクトリにインストールし `FHS_TEST_IDB_PATH` と `JSDOM_MODULE` を指定できる。アプリの依存には追加しない。

## 未検証・反映時の追記欄

- 実際の受付用iPadでの通信切断、スリープ、Safari／ホーム画面を閉じて再起動、送信途中の切断は未検証。上の模擬試験を実機合格の代用にしない。
- 実機での本人ログイン・通信切替は利用者の操作が必要。一般的な保存／照合／再送／DB試験は開発側で実施した。
- 専用PR・Winter検証環境の反映状態はPR／配備情報で確認する。main・Autumn本番・秘密設定・公開範囲は変更しない。

## 戻し方

画面の不具合時も端末のIndexedDB／サイトデータを消さない。新しいオフライン受付を止め、保存済み受付は同じ端末・URLから確認する。コードを戻す必要がある場合も、既存Winterの他の成果を巻き戻さず、この機能の差分だけを対象にする。追加RPCは旧コードから呼ばれないため残置可能。無効化する場合は該当RPCのauthenticated実行権限だけを取り消す。保存済み申請・出番・請求履歴は削除しない。
