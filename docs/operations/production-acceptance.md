# 第一階段正式上線驗收標準

這份清單是 HiDot Pay 第一階段「錢包＋帳本底座」的停止條件。所有項目都必須有可回看證據；測試程式、文件或 Terraform 存在，不等於已上線。任何一項未完成時，環境只能稱為開發／演練環境，不能保管真實使用者資產。

## 已有程式與實測證據

| 領域 | 已證明的行為 | 證據 |
| --- | --- | --- |
| 帳本 | 站內轉帳、充值到提現生命週期、併發提現都維持平衡且不會讓使用者帳戶負值 | `npm run test:integration` 使用獨立 `hidotpay_test` 資料庫 |
| 地址 | 同一使用者重啟／併發後仍取得同一地址；不同使用者不共用地址 | `services/ledger-api/tests/integration/wallet-addresses.test.ts` 使用獨立資料庫 |
| 提現 | 廣播逾時不自動釋放凍結，也不由 Temporal 重送；未確認交易轉人工覆核 | `services/withdrawal-worker/tests/withdrawal-execution.test.ts`、`services/workflows/tests/temporal-workflow.test.ts` |
| 權限 | 公開 API 驗 Logto issuer、audience 與角色；測試 header 不可在開發服務使用 | `services/ledger-api/tests/http/auth.test.ts` |
| 後台 | NocoBase 只透過 `admin_*` 唯讀檢視表存取財務資料，沒有簽名材料欄位 | `deployment/nocobase/finance-reader-grants.sql`、`services/ledger-api/tests/admin-read-views.test.ts` |
| P2P 託管 | 下單鎖定、放幣、退款都以獨立託管帳戶和等額雙式分錄完成；爭議只允許仲裁角色裁決 | `services/ledger-api/tests/http/p2p-orders.test.ts`、`services/ledger-api/tests/integration/p2p-order-repository.test.ts` |
| P2P 付款逾時 | 訂單保存付款期限；只有私有排程可退款「逾時且未付款」訂單，已付款或爭議中不可自動退款 | `services/ledger-api/tests/domain/p2p-order-state.test.ts`、`services/ledger-api/tests/p2p-timeout-runner.test.ts`、`deployment/kubernetes/base/p2p-payment-expiry.yaml`；已於獨立 CockroachDB 測試資料庫完成逾時退款實測 |
| 工作流可用性 | dispatcher 只在 Kafka consumer 已連線後回覆 ready；停止時撤回 ready | `services/workflows/tests/runtime-health.test.ts`、Kubernetes probe |
| 充值對帳工作流 | 已入帳事件只啟動對帳；專用 Temporal activity worker 只以不可變流水 ID 向 Blnk 對帳，排隊時持久等待 | `services/reconciliation-worker/tests/temporal-worker.integration.test.ts`、`deployment/kubernetes/base/reconciliation-worker.yaml` |

每次候選版本至少要執行：

```sh
npm test
npm run typecheck
npm run build
npm run verify:docs
HIDOTPAY_NOCOBASE_APP_KEY=僅供檢查的值 \
HIDOTPAY_NOCOBASE_DB_PASSWORD=僅供檢查的值 \
sh deployment/nocobase/smoke-test.sh
sh deployment/kubernetes/smoke-test.sh
sh deployment/terraform/smoke-test.sh
```

其中 `npm run test:integration` 會在同一個專用 `hidotpay_test` 資料庫依序驗證帳本併發、獨立地址、充值掃描去重、outbox 重送與 Blnk 對帳狀態；它拒絕未提供該測試資料庫的執行。

## 正式上線前仍必須完成的外部驗收

### 1. 身分與公開 API

- Logto 必須建立 API Resource `https://api-dev.hidotpay.com`，並建立一般使用者、財務覆核員、鏈上工作程式的最小權限角色。Staging SPA 已指向此 Resource；四種真實角色的允許／拒絕紀錄仍待保存。
- 以三個獨立身分測試：錯誤 audience、過期 token、偽造角色與越權提款都被拒絕。
- 以買方、賣方與仲裁員三個獨立身分測試：不得自買自賣、買方不能放幣、賣方不能在付款後取消、非仲裁員不能裁決；同一個 P2P 請求重送只能移動資產一次。
- 在隔離資料庫實測一筆逾時未付款訂單：排程只能退款一次；已標記付款、已開爭議、未到期的訂單都不得退款。確認 `p2p-payment-expiry` 的失敗告警、重試與執行紀錄可追查。
- 證據是 Logto 管理畫面設定截圖、測試紀錄與已部署 API 的拒絕／允許結果；不可只靠本機 JWT 單元測試。

### 2. 密鑰與簽名

- OpenBao 至少三節點、TLS、Raft HA、auto-unseal 與不可修改的 audit log 均已驗收。
- EVM 使用隔離的 Web3Signer／HSM；TRON 也必須有經審計的 secp256k1 隔離簽名方案。禁止把助記詞、私鑰或 root token 放入資料庫、環境檔、NocoBase 或 Git。
- 在測試網完成地址衍生、簽名、廣播、確認、失敗、重送與金鑰輪替演練，並由獨立安全審計簽核後，才可開啟主網。
- **目前禁止開啟主網提現：** `withdrawal-worker` 已驗證凍結、簽名拒絕、廣播逾時與確認結算規則，但尚未連接經驗收的 HSM／Web3Signer 實體簽名器與鏈上廣播器。不可用測試簽名、環境變數私鑰或一般 API 取代這個門檻。
- **公開 API 的安全預設：** `WITHDRAWALS_ENABLED` 未明確設為 `true` 時，`POST /v1/withdrawals` 會在建立凍結分錄前以 `withdrawals_disabled` 拒絕。即使設為 `true`，也必須同時明確提供日限額、單筆限額與白名單冷卻設定；提款先使用一次性、使用者綁定的手續費報價，並在同一筆帳本交易內驗證白名單、限額與報價後才凍結。開啟此旗標不是主網上線許可；只有本文件列出的簽名器、雙人審批、風控、測試網完整生命周期與人工演練全部有證據時，才可由兩名不同職責的人員變更它。

### 3. 資料與帳本

- CockroachDB 使用多區域／多可用區正式集群、獨立應用帳號、備份、還原演練與告警；NocoBase 帳號只能讀 `admin_*` 檢視表。
- 每次資料庫遷移只可由一個受控部署工作執行，先在隔離資料庫驗證可重跑與還原；CockroachDB 的線上欄位／索引回填不可把結構調整和資料回填塞進同一筆 SQL 呼叫。
- Blnk 使用私有網路、獨立最小權限 API key、可還原備份與多副本部署。以抽樣 reference 比對 CockroachDB 與 Blnk，差異必須是零或已有人工處理單。
- 每季演練一個資料庫節點或可用區失效，核心餘額查詢與已接受提現不可遺失。

### 4. 事件與工作流

- Redpanda 至少三個 broker、跨可用區、TLS/SASL/ACL、topic replication factor 3、`min.insync.replicas=2`；要實測 broker 故障時 outbox 仍可重送。
- Temporal 採 Temporal Cloud 或官方 HA 部署，持久化資料層高可用；以已批准的測試事件確認 worker 可消費、重試、人工暫停與復原。
- Kubernetes 工作負載要三可用區分散、三副本、PDB/HPA、NetworkPolicy、監控與告警皆已套用；每個工作負載使用獨立最小權限 AWS Pod Identity／IRSA。

### 5. 變更、監控與事故處理

- 每次部署先在隔離環境跑 migration、回歸與還原演練；正式套用 Terraform 前必須由第二位有權限者覆核 plan。
- 對以下項目建立告警與值班處理流程：帳本不平衡、Blnk 對帳差異、未確認提現、重複鏈上交易雜湊、outbox 堆積、工作流失敗、資料庫備份失敗、簽名拒絕異常。
- 完成一次單一可用區故障與一次完整還原演練，保留時間線、影響範圍、資料核對和改善紀錄。

## 允許與禁止的宣稱

- 全部「外部驗收」有證據前：可說「第一階段程式與部署基線已完成驗證」，不可說「正式託管已上線」或「可保管真實資產」。
- 全部外部驗收完成且第二人覆核後：才可將主網簽名開關納入受控變更，並以實際部署版本、時間與責任人記錄上線。
