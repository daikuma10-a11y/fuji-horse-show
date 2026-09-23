# 大会原本ファイルの版管理ルール

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

## 画面表示例
`現在参照中: 2026-09-XX XX:XX受領 / Autumn出番表 / version 3 / SHA-256 ...`

## 運用
新しいファイルを受け取った場合は「最新版だから」という理由だけで自動切替しない。差分を確認し、本部が参照版を切り替えた履歴を残す。