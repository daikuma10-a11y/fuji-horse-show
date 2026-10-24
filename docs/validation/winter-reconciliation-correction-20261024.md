# Excel取込③の照合差分をその場で訂正

2026-10-24。②の表内編集に続く修正。③で既存名簿との差分が見つかった際、理由だけが表示され、対応する人馬・名前・番号を直せずに作業が止まる問題を解消する。

## 操作

- 未確定の照合で要確認になった人馬の行に、候補選択、名前・読み・日馬連番号と番号確認の編集欄を表示。名簿との表記差と所属未確認を黄色で示す。
- 選択した名簿の値を併記し、同一人馬であると利用者が明示確認した場合に限り、その表記を今回の申込へコピーできる。Excel原本・共通名簿の更新は行わない。
- 所属のない候補は、申込団体への所属がある候補へ明示的に選び直せる。名簿自体の訂正が必要な場合は、確認下書きを端末に保存して既存の人馬登録欄へ移動する。保存失敗時は移動しない。
- 入力変更後も訂正欄と前回の確認事項を保持する。登録許可・確認チェック・出番の照合結果は無効化し、古い結果を現在の登録状況として表示しない。「訂正内容を再照合する」でサーバーを読み直す。
- ③にも訂正後の原本請求額・確認入金額の確認欄を用意。資格・会員区分などは同じ人馬の②の編集欄へ移動できる。URLのハッシュは変えない。
- 登録再開記録や保存開始後の入力は固定したまま。結果不明の人馬を明示照合する既存操作も保持する。
- ③の人馬・エントリー表の大きな最小横幅を撤去。利用幅760px未満で行を2列に折り返し、差分欄は行幅を使う。

## 検証

実コンポーネント・フックを合成サービス/端末記録で動かし、次を確認した。実原本・実名・認証情報は試験にも記録にも含めない。

- 既存名と申込名の表記差を、③のボタンから訂正。名前・読み・番号・明示選択IDが入力へ反映され、原本と共通名簿は不変。
- ③の直接入力でも訂正値が保持され、別の要確認行の編集欄が消えない。
- 同名で所属の異なる候補から正しい所属の人馬を選び直す。番号も同期し、再照合後に要確認が解除される。
- 編集後は最新の照合がなく、古い確認チェックを呼び直しても登録要求は0件。再照合と明示確認後だけ登録を開始する。
- 既存人馬の新規作成なしで参加・出番を登録できる。確定後は古い編集コールバックを呼んでも変更できない。
- 名簿への移動前に下書きを保存。保存失敗では移動せず、正常時はダウンロードを要求せず保存して移動。画面の切替でもExcelコンポーネントを保持。
- 原本を閉じると前回の訂正表示を解除。資格・料金・所属・イベント・認証・再送・端末競合の既存検査は変更していない。

実行した検証:

```text
node tests/winter-application-registration-components.cjs
node tests/winter-preregistration-components.cjs
node tests/winter-application-components.cjs
node tests/winter-application-table.cjs
node tests/winter-application-registration.cjs
node tests/winter-application-guide.cjs
node tests/winter-application.cjs
node tests/winter-import-review.cjs
node tests/winter-import-registration.cjs
node tests/master-input-forms.cjs
node tests/master-admin-settlement.cjs
node node_modules/next/dist/bin/next build --webpack
node node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

Autumnの既存入力・精算HTML比較を含む。ビルドは24ページ。今回DBデータ・DB権限・料金計算・登録エンジンの変更なし。保存先は既存の専用ブランチ、PR6と専用Preview。main・Autumn本番・prepへのマージは行わない。

実ブラウザーの実行環境がないため、実Excelを使ったブラウザー上の見え方・スクロールの最終確認は未実施。描画HTMLとイベント、状態遷移、生成CSS、型検査・ビルドまでを検証範囲とする。
