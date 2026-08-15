# Blnk 本機安全部署

這份設定供 HiDot Pay 的開發環境使用。它把 Blnk 限制為只有本機服務可存取，並強制所有帳本請求使用權限受限的 API 金鑰。

## 安全界線

- `BLNK_SERVER_SECRET_KEY` 是帳本主金鑰，只可用來建立或撤銷服務金鑰；不可交給 API、前端或寫入 Git。
- `hidotpay-development-blnk-api-key` 是 API 使用的受限金鑰，權限只有 `transactions:write` 與 `balances:read`。
- `hidotpay-development-blnk-reconciliation-key` 只給對帳工作程式使用，權限只有 `transactions:read` 與 `transactions:write`；不可交給公開 API。開發金鑰到期日為 2027-08-14，必須在到期前依輪替流程換新。
- Blnk 的 5001 連接埠只綁定在 `127.0.0.1`；PostgreSQL、Typesense、Jaeger 與 worker 連接埠不對主機公開。
- 這只保護單機開發環境。正式環境必須改用受管理的密鑰管理服務、私有網路、獨立資料庫帳號，以及多可用區部署。

## 首次設定

先使用 Blnk 官方 Compose 專案建立本機帳本，再建立主金鑰並放進 macOS 鑰匙圈。主金鑰只能存在鑰匙圈，不能寫入 `blnk.json`、`.env` 或本專案。

```sh
security add-generic-password -U -a hidotpay-development \
  -s hidotpay-development-blnk-master-key -w '請用密碼管理器產生的隨機值'
```

## 啟動或更新安全設定

在本專案根目錄執行。開始前先備份 Blnk 的 PostgreSQL 資料卷。

```sh
BLNK_SERVER_SECRET_KEY="$(security find-generic-password -w -s 'hidotpay-development-blnk-master-key')" \
docker compose -p blnk \
  -f /絕對路徑/infra/blnk/docker-compose.yaml \
  -f deployment/blnk/secure-local.override.yaml \
  up -d --force-recreate
```

成功後，未帶 `X-Blnk-Key` 的帳本請求必須回傳 HTTP 401，且 `lsof -nP -iTCP:5001 -sTCP:LISTEN` 只能看到 `127.0.0.1:5001`。

## API 啟動程式

`deployment/macos/run-public-api-development.sh` 會從 macOS 鑰匙圈讀取 `hidotpay-development-blnk-api-key`，以 `BLNK_KEY` 注入公開開發 API。此金鑰僅能讀餘額與建立帳務交易，沒有建立帳本、管理金鑰或管理 Webhook 的權限。

## 對帳工作程式

對帳程式不在公開 API 內執行。它讀取 CockroachDB 已入帳但尚未完成 Blnk 對帳的充值，使用同一筆 Cockroach 流水 ID 作為 Blnk reference；若網路中斷，下一次會先依 reference 查詢，不會重複建立資金交易。

在專案根目錄先完成所有服務建置，然後執行一次安全批次：

```sh
DATABASE_URL="你的獨立測試或正式資料庫 URL" \
BLNK_URL="http://127.0.0.1:5001" \
BLNK_KEY="$(security find-generic-password -w -s hidotpay-development-blnk-reconciliation-key)" \
RECONCILIATION_WORKER_ID="reconciler-zone-a-01" \
npm run run-once --workspace=@hidotpay/reconciliation-worker
```

正式環境必須把這把金鑰放在雲端密鑰服務，並由私有網路中的 worker 使用；不得把它放進 `.env`、NocoBase、前端或公開 API。Blnk 的交易查詢需要 `transactions:read`，建立交易需要 `transactions:write`。

若需要輪替服務金鑰：先以主金鑰建立新金鑰、更新鑰匙圈、重啟 API、驗證成功後，才撤銷舊金鑰。不可先撤銷舊金鑰。

## 還原原則

安全重啟不得加上 `-v` 或刪除任何 Blnk volume。若啟動失敗，應停止服務、以最近一次 PostgreSQL 備份還原到隔離環境驗證，再處理原服務；不可在資金資料庫上嘗試破壞性修復。
