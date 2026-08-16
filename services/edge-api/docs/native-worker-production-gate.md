# 原生 Worker 啟用門檻

`hidotpay-native-ledger-staging` 是 Cloudflare Workers + Hyperdrive 的公開預覽帳本。Logto API Resource 已接上後，`LEDGER_API_ENABLED` 可為 `true`，讓登入者讀餘額、看紀錄與做站內轉帳。`WITHDRAWALS_ENABLED` 必須維持 `false`。沒有隔離簽名器時，充值地址路由必須失敗關閉。

```json
{
  "LEDGER_API_ENABLED": "true",
  "WITHDRAWALS_ENABLED": "false"
}
```

## 已部署的受保護路由

- 錢包、餘額、內部轉帳與手續費報價
- P2P 廣告、訂單、託管狀態動作、仲裁與收款方式
- Ethereum／TRON 充值公開地址（經 `DEPOSIT_SIGNER` service binding）

原生 Worker 現在有受保護的 `POST /v1/deposits/confirmed`。此路徑**不接受**終端使用者 Logto JWT，也不接受 `x-actor-id`。呼叫者必須出示 Worker Secret `CHAIN_OPERATOR_TOKEN`（至少 16 字元，timing-safe 比對）。帶有瀏覽器 `Origin` 的請求一律 403。只接受官方測試網 `ethereum-sepolia` 與 `tron-shasta`；名稱含 `mainnet` 的網路在寫入帳本前拒絕。

測試網掃描由 `hidotpay-deposit-scanner-staging` 以 cron 呼叫此路徑。公開 RPC：

- Ethereum Sepolia：`https://ethereum-sepolia-rpc.publicnode.com`、`https://1rpc.io/sepolia`、`https://gateway.tenderly.co/public/sepolia`
- TRON Shasta：`https://api.shasta.trongrid.io`

沒有游標時，掃描器會把游標錨在目前安全水位，不回補歷史區塊。這不是主網資金入口。

除入帳路徑外，其餘 `/v1/` 請求都先驗證 Logto bearer token；未驗證請求不得建立資料庫連線、錢包、地址、報價、轉帳或 P2P 訂單。提款功能在 Worker 中不提供開啟路徑。

## 必要的 Worker Secret

以下值只能以 Cloudflare Secret 提供，禁止寫入 `wrangler*.jsonc`、Git、NocoBase、日誌或回應：

- `OPENBAO_TRANSIT_URL`、`OPENBAO_TRANSIT_TOKEN`：加密 P2P 收款資料；缺少時路由必須失敗。
- `SIGNER_SERVICE_TOKEN`：帳本呼叫隔離簽名服務時使用的服務權杖；缺少時充值地址路由必須失敗關閉，並回傳 `signer_unavailable`。
- `SIGNER_DERIVATION_URL`：僅在沒有 `DEPOSIT_SIGNER` service binding 時作為後備 HTTPS 路徑；正式 staging 必須用 Worker 對 Worker binding，不得依賴公網呼叫簽名器。
- `CHAIN_OPERATOR_TOKEN`：僅供充值掃描器呼叫 `/v1/deposits/confirmed` 的服務身分。不得放入錢包 App、NocoBase、瀏覽器或公開文件。缺少或短於 16 字元時，入帳路徑必須失敗關閉。

私鑰、助記詞、seed 與任意簽名 API 一律不得放入 Worker。

## 啟用前驗收

1. 在獨立非正式 CockroachDB 資料庫以專用帳號跑 `npm run test:integration`，必須通過轉帳併發、防重送、P2P 託管、地址併發、充值與提現不變量。
2. 以真實 Logto token 驗證一般使用者、鏈上工作程式、財務覆核員與仲裁員的允許／拒絕情況。
3. 以測試用 OpenBao 與私有簽名服務驗證：收款資料僅保留密文，地址衍生未暴露任何密鑰材料。
4. 執行 Blnk 對帳、資料庫還原與 Worker 回滾演練，保存版本、時間與結果。
5. 開啟帳本讀寫後，`WITHDRAWALS_ENABLED` 仍維持 `false`，直到正式簽名器、白名單、限額、雙人覆核與主網演練通過。充值地址在簽名器未接上前必須失敗關閉。

## 回滾

若任何驗收或監控失敗，先把 `LEDGER_API_ENABLED` 設回 `false`，再以 Wrangler 的既有版本部署紀錄回滾。不得藉由停用帳本約束或直接修改餘額來恢復服務。
