# Blnk 充值對帳工作程式

這個工作程式只處理「CockroachDB 已經完成不可變入帳、但 Blnk 副帳本尚未確認」的充值。CockroachDB 是資金事實來源；Blnk 暫時不可用時，不會回滾或重複使用者餘額。

## 正常結果

- `applied`：Blnk 已確認同一個 reference，資料庫標記為已對帳。
- `queued`：Blnk 已接受但還在處理，下一次只查同一個 reference。Blnk 完成排隊交易後會以該 reference 加上 `_q` 後綴保存最終交易；工作程式會依此查到最終 `APPLIED` 狀態。
- `failed`：Blnk 或網路暫時失敗，資料庫保存受限長度錯誤並在下一次重試。

每一筆資料有 60 秒租約；多個 worker 同時運行時，同一筆不會被兩個 worker 同時處理。即使租約在外部呼叫前後失效，Blnk reference 仍可阻止重複記帳。

## Temporal 持久對帳模式

當 `deposit.credited` 事件已寫入 outbox，使用者餘額已經在 CockroachDB 入帳；Temporal **只能**針對 payload 的 `ledger_transaction_id` 啟動對帳，不可再次建立充值分錄。對帳 worker 以該 ID 取得單筆租約，Blnk 回覆 `QUEUED`／`INFLIGHT` 時，Temporal 會以同一 ID 持久等待並再次查詢 reference，直到 `APPLIED`。

在私有環境執行 activity worker 時，`RECONCILIATION_TEMPORAL_TASK_QUEUE` 必須與 workflow dispatcher 的 `TEMPORAL_TASK_QUEUE` 相同：

```sh
DATABASE_URL="你的獨立資料庫 URL" \
BLNK_URL="你的私有 Blnk URL" \
BLNK_KEY="由密鑰服務注入的對帳金鑰" \
TEMPORAL_ADDRESS="你的私有 Temporal 位址" \
TEMPORAL_NAMESPACE="hidotpay" \
RECONCILIATION_TEMPORAL_TASK_QUEUE="hidotpay-financial-v1" \
RECONCILIATION_WORKER_ID="reconciler-zone-a-01" \
npm run run-temporal --workspace=@hidotpay/reconciliation-worker
```

此服務只註冊 `reconcileLedger` activity，沒有公開 HTTP API、沒有簽名權限，也不處理提現廣播。Kubernetes 部署會以 Pod 名稱作為唯一租約身分，並只允許連向私有 Blnk、CockroachDB、Temporal 與 DNS。

## 權限

對帳工作程式使用獨立 Blnk 金鑰，只包含：

- `transactions:read`
- `transactions:write`

它不需要 Blnk 主金鑰，也不需要金鑰管理、Webhook、帳本管理或前端存取權。

## 上線前檢查

1. 每個環境建立各自的到期金鑰，放進雲端密鑰服務。
2. worker 只能透過私有網路連 Blnk 與 CockroachDB。
3. 設定 `RECONCILIATION_WORKER_ID` 為每個執行個體唯一值。
4. 監控 `failed` 不為零、排隊時間過長，以及任何 Blnk/Cockroach 對帳差異。
5. 尚未完成 HSM、主網簽名和雙人提現工作流前，不可把本開發環境當作真實資產託管環境。
