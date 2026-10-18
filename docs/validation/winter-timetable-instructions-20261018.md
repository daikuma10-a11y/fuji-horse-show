# タイムテーブルの定型表記（2026-10-18、Asia/Tokyo）

## 承認・仕様

利用者が下見の「オープン」「組み換え時間」、開始の「前競技に引き続き」の追加を依頼し、共通マスターへの反映も明示した。時刻指定・空欄（未定）・予定／確定は引き続き使用する。各競技への実際の割当は主催者が入力する。推測で大会の時刻・表記を設定しない。

## 実装

- `lib/master/timetable.ts` に共通の選択肢と項目別検証を保存。
- `components/master/timetable-time-field.tsx` に共通入力部品を追加。Winterの両時刻編集入口から同じ部品を利用する。下見用の選択肢を開始へ流用しない。
- 既存の文字列／null形式を維持し、`save_winter_timetable` の入力許可だけ拡張。管理権限、Winter限定ID、競合拒否、元notes保持、更新通知は維持。DB migration名は `winter_timetable_named_times`。
- `loadWinterData` は共通の検証を利用。共通タイムテーブル・出番表（画面／印刷）、既存モニター・CSVへ同じ保存値を渡す。文字列を仮の数値時刻へ置換しない。
- Autumn adapterの接続・表示の回帰検査を維持。Autumn本番へのデプロイ・データ変更は行わない。今回の共通部品は他大会でも再利用できるが、Autumn本番に新しい時刻編集機能を公開したという意味ではない。

## 検証

完成・検証済み（自動／DB検証の範囲）：

- 既存24検査と、master-timetable-time／winter-timetable／winter-data／winter-export／winter-live／master-input-forms／master-request-actions／master-settlement-historyの計32検査が成功。
- 型チェック `pnpm exec tsc --noEmit --incremental false`、Nextビルド成功。
- 共通入力部品の選択・時刻指定への復帰、実editorの保存payload、空欄化、競合時の再読込を検証。実loaderから日別表・出番時間ヘッダー・モニターの再構成／描画・CSVまで定型表記を保持。
- 実DBで新定義を一度ROLLBACK内で検証し、適用後にも `tests/winter-timetable-db.sql` が成功。時刻／定型表記の保存・読戻し、空欄化、古い期待版、他大会、匿名／非管理者、項目違いの表記、不正時刻を確認。検証用の競技更新はすべてROLLBACK。
- security advisorsの変更前後の項目と件数は一致。既存の管理者限定SECURITY DEFINERの警告は維持し、今回の新しい警告はない。認証チェックや権限の緩和は行わない。
- 初回の検査で、既存のwinter-data／winter-horse-registrationの独自Node loaderが新しい共通TS依存を解決できなかったため、既存register-ts.cjsを読込む形へ修正。アプリの回避処理は追加せず、再実行成功。

実装済み・未検証：新しい選択肢の認証付き実ブラウザー保存、iPadの操作、Canonの紙出力。DB検証・mock操作をこれらの成功として扱わない。

## 操作・引き継ぎ

管理画面→タイムテーブル→対象競技の「時間を編集」→下見時間／開始時間の指定方法を選択→「時間を保存」。出番表下の既存時間設定も同じ入力部品。時刻を入れる場合は「時刻を指定（空欄は未定）」へ戻す。

更新前から開いている画面は再読込して新しい選択肢対応版を使う。古い画面が新表記を解釈できない場合も、保存済みデータを消さず再読込する。既存の未保存草稿がある場合は先に公式exportで保持する。
