# HiDot Pay NocoBase 唯讀後台投影設計

## 目的

建立不需要 NocoBase 商業外接資料庫模組的財務後台資料面。CockroachDB 中的帳本仍是唯一資金真相來源；NocoBase 只保存可重建的唯讀查詢投影，供受授權的營運、客服與風控人員查看。

此設計不讓 NocoBase 直接連線、寫入或修改 CockroachDB 帳本，也不讓 NocoBase 持有私鑰、簽名器憑證、OpenBao Token 或提款核准權。

## 已確認限制

- NocoBase Community Edition 不包含外接 PostgreSQL 或 REST API 資料來源模組；這兩個模組均需要商業授權。不得假設目前本機映像可直接讀取 CockroachDB。
- 現有 CockroachDB 的 `hidotpay_nocobase_reader` 只有 `admin_*` 檢視表的 `SELECT` 權限；這個帳號可用於投影工作者讀取，但不進入 NocoBase UI。
- 帳本、充值、提現與 P2P 的寫入路徑均不可依賴 NocoBase。NocoBase 停機、資料落後或重建時不得改變使用者資產。
- 正式資產環境之前，`LEDGER_API_ENABLED` 與 `WITHDRAWALS_ENABLED` 繼續維持關閉。

## 架構選擇

1. **直接接外部 CockroachDB**：操作簡單，但需要 NocoBase 商業外接資料庫模組，並需在 UI 保存連線憑證。
2. **NocoBase 主資料庫的唯讀投影（採用）**：由獨立投影工作者讀取受限的 `admin_*` 檢視表，再以冪等方式寫入 NocoBase 自己的資料庫。後台只讀取其本機投影。
3. **讓 NocoBase 直接呼叫資金 API**：把後台暴露在資金寫入面，破壞職責分離；不採用。

選擇方案 2。它能使用目前的開源 NocoBase，並把資料庫憑證、帳本寫入與後台頁面完全分開。投影可以延遲或重建，卻不會改變餘額或提現狀態。

## 元件與資料流

```text
CockroachDB 帳本（唯一真相）
  └─ admin_* 唯讀檢視表
       │ 專用讀取帳號
       ▼
admin-read-model-worker（無狀態、可重跑）
  ├─ 游標與來源版本檢查
  ├─ 欄位白名單與遮罩
  ├─ 冪等 upsert
  └─ 延遲與失敗 metrics
       ▼
NocoBase PostgreSQL（可丟棄投影）
  ├─ admin_wallet_addresses
  ├─ admin_deposit_receipts
  ├─ admin_withdrawal_requests
  ├─ admin_ledger_transactions
  └─ admin_withdrawal_risk_decisions
       ▼
NocoBase 只讀角色與低代碼清單／篩選／圖表
```

P2P 相關集合只在帳本資料庫已安全套用 P2P migration 且出現對應唯讀檢視表後才加入；不可因建立後台而先改正式帳本 schema。

## 資料與權限規則

- 每一筆投影紀錄以來源 UUID 作為固定 `source_id`；重跑必須更新同一筆資料，不可累積重複紀錄。
- 投影欄位採固定白名單。不得投影私鑰、助記詞、簽名請求、OpenBao 密文、完整付款帳號或內部服務 Token。
- 投影帳號只可讀取 NocoBase 所需的 `admin_*` 檢視表。投影工作者不得取得 CockroachDB 資料表寫入權限。
- NocoBase 的「財務檢視者」角色只允許清單、篩選、匯出與查看；沒有新增、編輯、刪除、資料來源管理、外掛管理或自訂 HTTP 動作權限。
- 提款的「核准」日後仍只能經過 Logto 角色、雙人覆核、風險檢查與獨立簽名服務；不會由低代碼後台直接發出。

## 可靠性與可觀測性

- 每個集合都保存 `source_updated_at` 與 `projected_at`。後台需顯示最新成功投影時間與落後秒數。
- 工作者失敗時保留前次投影並發出告警；不得將「無法同步」顯示為零餘額或已完成提現。
- 支援全量重建到新命名空間，再原子切換讀取集合；重建不會改寫來源帳本。
- 連續同步使用可排序來源游標與小批次；重新啟動必須安全重跑。

## 驗收與上線門檻

1. 讀取帳號可讀指定 `admin_*` 檢視表，且沒有來源表的新增、修改或刪除權限。
2. 同一來源資料同步兩次後，NocoBase 投影筆數不重複且內容一致。
3. 來源資料不存在、欄位不符或投影落後時，後台清楚顯示錯誤／時間，不誤導資產狀態。
4. 「財務檢視者」嘗試修改、刪除、建立資料來源、建立自訂請求均被拒絕。
5. 測試資料庫與正式資料庫分離；正式帳本 migration、讀取帳號與備份／還原演練均有獨立驗證紀錄。

此階段只交付可驗證的後台查詢投影基礎，不構成可上線保管使用者資產的宣告。
