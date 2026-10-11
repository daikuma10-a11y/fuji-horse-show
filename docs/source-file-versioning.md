# 大会原本ファイルの版管理・取込ルール

## 目的
出番表・エントリー表・選手馬情報などの原本について、どの時点で受領したどの版をシステムが参照しているかを常に追跡可能にし、再送・差替え・上書きによる誤作業を防ぐ。

## 必須ルール
1. 原本は上書きしない。受領ごとに別バージョンとして保存する。
2. 各受領版に `received_at`（受領日時、Asia/Tokyo、分まで）を必ず記録する。
3. 元のファイル名、ファイル種別、大会ID、資料種別、保存先、ハッシュ値（SHA-256）を記録する。
4. 現在システムが参照している版は `is_active=true` として1版だけ明示する。
5. 新版へ切り替えても旧版を削除しない。
6. 取込処理には必ず `source_file_version_id` を保持し、どの原本から生成されたデータか逆引きできるようにする。
7. 本部画面で「現在参照中の原本」「受領日時」「過去版」を確認できるようにする。
8. ファイルの再送を依頼する前に、保存済み原本・履歴・GitHub/DBの記録を確認する。

## Excel原本に対する大前提
大会で使用されたExcelは、数式が完全であることを前提にしない。数式抜け、参照切れ、`#REF!`、`#N/A` 等のエラー、日馬連未登録による取得不能、当日の手入力・上書きが混在し得る。

### 取込優先順位
1. 当日に人が確認して入力・上書きした最終セル値を尊重する。
2. 数式そのものを正解データとして再現しない。利用できる確定値がある場合は値を利用する。
3. 数式エラー・空欄は推測補完せず、`missing` / `needs_review` として保持する。
4. 日馬連マスタに存在しない人馬も有効な大会データとして登録可能にする。
5. フリガナは補助情報であり、フリガナ欠損を理由に選手・馬を無効化しない。
6. 原本表記 (`source_value`) と表示・検索用の正規化値 (`normalized_value`) を分離し、原本表記を失わない。
7. 手入力値には `manual=true`、可能なら `edited_at` / `edited_by` を記録し、後からマスタ同期で上書きしない。
8. 同一人物・同一馬・同一団体と思われる表記揺れは自動統合せず、候補として扱う。確定統合には確認履歴を残す。

## DB想定
### source_files
- id
- event_id
- document_type
- original_filename
- received_at
- stored_at
- sha256
- storage_path
- version_no
- is_active
- supersedes_id
- note

### imports
- id
- source_file_id
- imported_at
- importer_version
- status
- row_count
- error_count

### imported_values / audit fields
- source_file_id
- source_sheet
- source_cell
- source_value
- normalized_value
- formula (存在する場合のみ監査用に保持)
- formula_error
- manual
- needs_review
- edited_at
- edited_by

## 画面表示例
`現在参照中: 2026-09-XX XX:XX受領 / Autumn出番表 / version 3 / SHA-256 ...`

## 運用
新しいファイルを受け取った場合は「最新版だから」という理由だけで自動切替しない。差分を確認し、本部が参照版を切り替えた履歴を残す。

大会当日に日馬連未登録などで人馬情報が自動取得できない場合、本部から手入力できるようにする。その値は正式な大会運用データとして扱い、後日の自動同期で無断上書きしない。