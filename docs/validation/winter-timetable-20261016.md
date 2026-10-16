# Winterタイムテーブル欄

利用者の2026-10-16指示：添付Autumnタイムテーブルを参考に、Winter管理画面で時刻を編集し各出番表へ反映する。大会の実開始時刻は未指定であり推測入力しない。

共通MasterTimetable／MasterCompetitionTime、neutral型lib/master/timetable.tsを追加。Winter adapterは正式競技データと既存save_winter_timetableを利用。11/13〜15の日別表に競技、下見、開始、予定／確定、棄権を除く出番件数を表示。「時間を編集」で既存の時刻編集・保存・競合時再読込が可能。出番表の画面と競技ごとの印刷ヘッダーも同じ保存済みデータを表示。モニター／CSVの既存時間接続を維持。Autumnの日付・時刻や競技内容は転記しない。

新画面・時間表示は共通masterに保存。Winter固有の認証・保存RPC・データをadapterに維持。既存の出番移動、未保存草稿、再試行・料金計算・精算には変更なし。Autumn本番へデプロイしない。

完成・検証済み：型チェック、クリーンビルド、新規winter-timetable.cjs（実editorの認証済み保存引数／期待版・競合・再読込・空欄、日別表と頭数、出番画面・印刷接続）、winter-start-list-layout、winter-live、startlist-preview、master-request-actions、master-settlement-history。

実DB検査：既存関数定義を読取。tests/winter-timetable-db.sqlで保存→DB読取一致、管理権限、anon実行不可、競合拒否、無効時間拒否、クリア、他大会拒否を確認。トランザクション全体ROLLBACK済み。DB schema／設定変更なし、時刻テスト値の永続保存なし。ブラウザーの実管理者ログインによる保存操作とは区別する。

ビルド初回は作業環境のTurbopackキャッシュ読取破損。生成.nextを退避し同じpnpm buildを再実行して成功。アプリ／build設定は変更しない。

実装済み・未検証：新しい管理タイムテーブル欄からの認証付き実ブラウザー保存・再表示、別端末モニターの実観測、iPad実操作・物理印刷。本番の予定時刻は主催者の入力待ち。画像内のOPEN／前競技同時等の注記入力、インドア練習馬場の別表は今回実装していない。

操作：Winter管理画面→タイムテーブル→対象日の競技で時間を編集→下見・開始、予定／確定を入力→時間を保存→出番表で同競技を選択。別操作で更新されたら最新の時間を読み込んで再確認する。
