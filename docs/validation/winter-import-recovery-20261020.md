# 取込復旧版の検証（2026-10-20）
前回d3d5380の合格結果は流用せず、今回の復旧ソースで実施。

## 新たに実行した検査
- `tests/winter-import-registration.cjs` PASS：読込・照合で書込なし、明示対応、独立した原本会計、通常登録、同資料再取込、別番号の既存同一組合せ、所属／名前／料金／会員区分／訂正／棄権差分、他大会拒否、応答喪失後の再開、1件後停止、保存容量・認証失敗、偽の完了フラグ、他所属人馬。
- 影響範囲 `winter-import-review.cjs`、`winter-initial-entry.cjs`、`winter-initial-batch.cjs`、`winter-settlement.cjs` PASS。
- `tsc --noEmit` PASS。`npm run build` PASS。Nextのビルドは型検査を省略する設定なので独立の型検査も実行。
- `tests/winter-import-registration-db.sql` PASS。先に前回取込fixtureの不存在を読取確認。新規の合成人馬4件を既存名簿・参加RPCで登録し、2件の事前登録・読戻し・再送・重複拒否・訂正拒否・所属／会員／料金／大会／権限拒否を検査。入金・他大会出番のhash不変。全追加行をrollback。既存行を削除／上書きせず、実参加資料不使用。
- 検証DBは既存Winter設定と一致。DB構造・RLS・RPC定義変更なし。Supabaseの現行関数ドキュメント・更新履歴を確認。新規SDK・権限は導入しない。

## 保全checkpoint 1
`fa051a2808dfc8557a11bb6394405f6b41e9b61b` を含む差分bundleを保存・再取得。アーカイブSHA-256 `766497bf1a540b891077b1749a3e49265fb19342f4b51513339eff0564e33ce0`。基準8b62cedしか存在しない別Git領域で対象commitが取得前には存在しないこと、bundle取得後のcommitと変更3ファイルのSHA一致を確認した。秘密・実参加資料・DB export・認証状態・依存物を含めない。最終版は後続の保全で記録する。

## 残る確認
公開前に全送信コミット・新規blobを点検する。通常push後にGitHubと既存Winter PreviewのSHA一致・実画面確認を行う。管理者実画面の保存E2E、実iPad通信断、実プリンターは合格を確認するまで未検証。
