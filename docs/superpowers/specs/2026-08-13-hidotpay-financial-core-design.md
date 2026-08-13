# HiDot Pay 中央帳本核心設計

## 目的

建立可獨立部署的中央帳本服務，作為 HiDot Pay 的唯一資金真相來源。它支援多資產餘額、鏈上充值完成後入帳、平台內部轉帳與外部提現的安全狀態追蹤。

本設計只建立金融核心與開發叢集驗證；不接入真實私鑰、MPC 簽名、區塊鏈節點、卡片或法幣服務。因此不會在此階段接觸或保管真實使用者資產。

## 已確認的限制

- 現有 `app/` 是 Logto 登入測試 App，不能直接承擔財務邏輯。
- CockroachDB Basic 叢集只用於開發與整合測試；正式資產環境必須改用具私有連線、備援與營運控制的生產方案。
- 聊天中提供的資料庫密碼只可透過本機環境變數使用，禁止寫入 Git、文件、測試輸出或日誌；完成此工作後必須更換。
- 所有金額以資產最小單位的整數表示，例如 USDT 的 `1000000` 代表 1 USDT；禁止浮點數。
- 公開 API 需使用 Logto access token；沒有設定 Logto audience 時，服務不得以 production 模式啟動。

## 架構選擇

### 選項比較

1. 直接採用 OpenDAX：功能廣，但包含交易所、撮合與大量不必要服務，更新面與安全面過大。
2. Blnk 加 CockroachDB：Blnk 目前只正式支援 PostgreSQL，未驗證相容性前不可以作為資金核心。
3. 獨立的小型金融核心：以 CockroachDB 的可序列化交易保護金額正確性，程式只處理必要帳本規則、API 與文件。

採用選項 3。它減少依賴面，讓每一筆資金變動都可驗證、稽核與重放，同時保留日後以 AWS 無伺服器 API 與 MPC 簽名服務橫向擴展的邊界。

## 元件與責任

```text
Expo App / 未來管理後台
        │ Logto access token
        ▼
ledger-api（無狀態，可水平擴展）
 ├─ Auth：驗證 JWT、取得操作者
 ├─ Transfers：冪等請求、授權與限額檢查
 ├─ Ledger：雙向分錄與餘額更新
 ├─ Deposits：只接受鏈上監聽工作者送出的確認結果
 └─ Withdrawals：凍結、審核、廣播、確認或退回狀態
        ▼
CockroachDB（唯一資金真相來源）
 ├─ immutable ledger_transactions / ledger_postings
 ├─ account_balances（同一交易內同步更新的查詢投影）
 ├─ idempotency_records
 └─ outbox_events（可靠交給後續鏈上工作者）
```

服務不保存私鑰。日後的鏈上廣播工作者只接收已授權的提現工作，並透過獨立 MPC / HSM 簽名層處理；帳本 API 無法直接簽名。

## 資料模型與不變條件

### 核心表

- `assets`：資產代號、最小單位位數與啟用狀態。
- `accounts`：使用者、平台熱錢包、外部清算與暫存帳戶。
- `ledger_transactions`：每一次價值移動的不可變標頭、唯一冪等鍵與請求雜湊。
- `ledger_postings`：不可變的正負分錄；同一交易、同一資產的合計必須為零。
- `account_balances`：由同一 SQL 交易更新的餘額投影；不可單獨寫入。
- `withdrawal_requests`：外部提現的狀態機與凍結金額。
- `outbox_events`：與帳本變動同一交易提交的後續工作事件。

### 強制規則

1. 已提交的分錄和交易標頭不可更新或刪除。
2. 所有餘額與分錄使用 `DECIMAL(39,0)`，拒絕小數、零與負的轉帳輸入。
3. 內部轉帳必須在同一可序列化資料庫交易中完成：確認請求冪等性、鎖定相關餘額、檢查可用餘額、寫入兩筆分錄與更新兩個餘額。
4. 對同一冪等鍵重送相同內容，回傳原結果；重送不同內容，回傳衝突，不可新建交易。
5. 外部提現先把可用餘額移到凍結帳戶；只有鏈上確認成功才完成，拒絕、失敗或過期時必須以新交易退回。
6. 充值只有在鏈上工作者給出足夠確認數、交易雜湊與資產／網路相符時才可入帳；重送相同鏈上交易不得重複入帳。

## API

所有 API 以 `/v1` 開頭，JSON 使用 `snake_case`，所有金額使用字串整數。OpenAPI 規格是對外契約的唯一來源。

| 方法 | 路徑 | 用途 |
|---|---|---|
| `GET` | `/healthz` | 不含敏感資料的服務健康檢查 |
| `GET` | `/v1/accounts/{account_id}/balances` | 取得已授權帳戶的可用與凍結餘額 |
| `POST` | `/v1/internal-transfers` | 平台內部零鏈上費轉帳，必須含 `Idempotency-Key` |
| `POST` | `/v1/deposits/confirmed` | 僅限受信任鏈上工作者寫入確認後充值 |
| `POST` | `/v1/withdrawals` | 建立並凍結外部提現 |
| `POST` | `/v1/withdrawals/{id}/approve` | 僅限具職責分離權限的審核者 |
| `POST` | `/v1/withdrawals/{id}/settle` | 僅限鏈上工作者回報成功、失敗或逾時 |

## 錯誤與可靠性

- 統一錯誤格式含穩定 `code`、使用者可讀訊息與請求追蹤 ID，不回傳 SQL、憑證或內部堆疊。
- CockroachDB 的可序列化衝突只對安全的資料庫交易執行有限重試；所有寫入均靠冪等鍵防重。
- 每個資金事件在帳本交易中同時寫入 outbox。外部工作者採取後才標記已送出，服務重啟不會遺失事件。
- 健康檢查與 metrics 不得輸出帳戶、交易金額、Token、密碼或完整鏈上地址。

## 文件結構

沿用 docs.rw 的「Overview → Quick start → API → Guides」閱讀順序，採 Markdown 與 OpenAPI，避免把文件綁在第三方 SaaS：

```text
docs/
├─ overview/quick-start.md
├─ api/openapi.yaml
├─ api/README.md
├─ guides/security-model.md
├─ guides/operations.md
└─ architecture/financial-core.md
services/ledger-api/
├─ src/
├─ migrations/
├─ tests/
└─ README.md
```

## 測試與上線門檻

- 單元測試：金額驗證、冪等內容雜湊、雙向分錄平衡、提現狀態機。
- 整合測試：使用 CockroachDB，覆蓋轉帳、餘額不足、重送、同時轉帳、充值去重與提現退回。
- 契約測試：OpenAPI 與 API 回應一致，文件範例可通過驗證。
- 安全檢查：Git 不含密碼、連線字串或憑證；production 模式拒絕未設定 JWT audience；資料庫 migration 不含破壞性 `DROP`。
- 此階段完成後只代表「開發帳本核心可驗證」，不是可上線保管資產。真實資產前還需要外部安全審計、MPC/HSM、KYC/AML、法律審查、災難復原演練與生產私有網路。
