# Winterをホーム画面から起動する設定

## 問題と修正

`/winter` のHTMLが共通の `/manifest.webmanifest` を参照し、その `start_url` が `/` のため、iPadのホーム画面からAutumn受付で起動する。公開済みWinter受付のHTMLとmanifestをHTTPで取得し、この組合せを確認した。

Winterレイアウトから専用 `/winter/manifest.webmanifest` を指定する。アプリID、起動先、scopeを `/winter`、表示名を `FHS Winter` とする。受付トップに加え、精算・管理・追加・変更・棄権のページにも継承する。`/winter/` はNext.jsが `/winter` に正規化するため、scopeも正規の起動先を含める。

共通のファイル規約によるmanifestが子レイアウトの明示設定より優先されることをビルド後のHTTP試験で検出。Autumnのmanifest内容とURLは保持したまま、通常のRoute Handlerで配信し、ルートレイアウトの明示設定へ移した。これによりWinter側だけでmanifestを切り替えられる。画面コンポーネント・入力方法・大会データ・精算処理は変更しない。

## 検証

- Next.js 16.3.3 webpackビルド（25ページ）、TypeScript検査、diff検査を通過。
- ビルドした実サーバーへの `tests/winter-home-screen.cjs` で6つのWinterページを確認。manifestリンクが一つだけで専用URL、Apple用タイトルがWinter、起動URLがWinterのscope内、4つの受付操作がWinterのリンク、アイコンがHTTP 200であることを検証。
- Autumn側のmanifestリンク・起動先・scopeを保持。Autumn本番をデプロイしない。
- 実機のiPadで削除・追加・起動は未実施。利用者には修正したURLをSafariで開き、新しいWinterアイコンを追加して確認してもらう。Safariの履歴・サイトデータ全消去は不要。
- この変更でDB・権限・接続キー・人馬・出番・精算・入金を更新しない。現在の大会登録は利用者申告どおりテスト登録として扱う。

## 保存・反映先

最新の `prep/winter-2026` (`12708d69d7685e430b7c546f619be9a8fcb61dcc`) を起点に、今回の起動先修正だけの専用ブランチ・PRを作成して同ブランチへ通常マージする。既存のExcel改修PR全体はマージしない。Excel改修ブランチにも同じ修正を取り込み、後の更新で戻らないようにする。GitHub取得後のファイル一致と、Vercelの対象版・alias・公開HTTP応答を確認する。

参考：Next.js Metadata API、W3C Web Application Manifest、AppleのiPad Safariホーム画面追加手順。設定とHTMLは実際の稼働版で確認する。
