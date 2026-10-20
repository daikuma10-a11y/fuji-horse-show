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

## 保全checkpoint 2・公開点検
実装版 `b0cb0fd2d2191012dfb698f8b3288eccd9901b0f`（前段 `fa051a2` を含む）を差分bundle・10変更ファイルのhash manifest・復元手順・公開点検結果とともに新規保存した。アーカイブSHA-256 `4570268f2b93a49fa05be1518a6016b01a65dd33bc680edfcc7e476747094527`。実IDから再取得し、基準8b62cedだけの別Git領域で対象commitと全10ファイルの一致を確認。未コミットソースなし。生成物のみ除外。
送信予定2コミットの全10ファイル版を点検。合成文字列・生成UUIDだけを試験に使用し、実参加資料・DB export・画像・ログ・秘密情報は含まない。既存の公開ブラウザーキーは基準版から不変。復元用bundleはリポジトリ外に保存。

## 外部保存の障害と残る確認
通常の `git push origin HEAD:prep/winter-2026` は終了コード128、`could not read Username for 'https://github.com': No such device or address` で失敗。今回の障害はGit送信用認証の取得不能で、自動承認審査による拒否ではない。利用者の指示に従い別認証・別送信経路への切替は行わない。
失敗後のリモート照会で `prep/winter-2026` は `8b62ced0b686b7d392a0e11d2b4ce21b9d93c72d` のまま。既存Vercelプロジェクト `fhs_fix` の同ブランチPreviewも同SHA、READY。既存URLは `https://fhsfix-git-prep-winter-2026-daikuma10-7300.vercel.app/winter/prepare`。main・Autumn・権限・公開範囲の変更なし。
復旧版は画面へ未反映のため、ブラウザーでの読込→対応選択→照合→確認→管理者確定→保存結果再表示、ブラウザー上の二重登録防止・途中再開は未実施。実iPad通信断も未検証。DB RPC検査・ローカル検査を実画面の合格として扱わない。
再開時は最終退避物を実IDから取得・復元し、リモート最新を確認する。送信用認証が利用可能になった後に通常push、Previewの同SHA確認、既存管理者認証とDB・大会照合、既存ダミーの状態確認、必要な実画面試験だけを行う。本記録を含む最終退避物のID・hash・復元結果は利用者への終了報告で示す。
