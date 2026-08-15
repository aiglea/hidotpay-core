# HiDot Pay 第一階段 15 項資金底座實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可自託管、可多鏈擴充、每位用戶有獨立充值地址，並能安全完成充值、站內轉帳及外部提幣的錢包與帳本底座。

**Architecture:** CockroachDB 是 HiDot Pay 業務資料與不可變資金流水的來源；Blnk 只作為受限存取的雙式帳本核心，兩者以明確的入帳參考號和對帳規則連接。鏈上地址、掃描和簽名被拆出一般 API；一般 API、前端和管理後台永遠不能讀取私鑰。

**Tech Stack:** TypeScript、Fastify、CockroachDB/Postgres 相容協定、Blnk、Logto、Redpanda、Temporal、NocoBase、Vault/KMS、Docker/Kubernetes。

## Global Constraints

- 所有金額使用原子單位字串或 `DECIMAL(39,0)`；禁止 JavaScript `number` 做資金計算。
- 使用者身份一律由 Logto JWT 取得；禁止信任前端傳來的使用者 ID 或角色。
- 每一筆資金變動必須可重試、可去重、可審計，且有完全平衡的借貸分錄。
- 充值地址、鏈、資產、合約與確認門檻都必須資料化；禁止寫死在 UI。
- 私鑰、助記詞、主金鑰與服務金鑰不可寫入 Git、資料庫明文、前端、日誌或測試固定字串。
- 每個任務先寫失敗測試，再寫最小實作；完成後跑全測試、型別檢查、建置與對應整合驗證。
- 每次可發布的更新都遞增版本號，提交訊息與變更記錄使用繁體中文。

---

### Task 1: Logto JWT 驗證、角色與 API 授權邊界

**Files:**
- Modify: `services/ledger-api/src/http/auth.ts`, `services/ledger-api/src/config.ts`, `services/ledger-api/src/http/app.ts`
- Test: `services/ledger-api/tests/http/auth.test.ts`

**Acceptance:** API 只接受已驗證、指定 audience/issuer 的 JWT；鏈上 worker、財務審核員和一般使用者角色不可互相偽造；開發用 header 驗證只可在隔離測試環境存在。

- [ ] 寫入匿名、偽造 actor、錯誤 audience、越權角色的失敗測試。
- [ ] 以 Logto JWKS 驗證 JWT 並從 token claims 建立 actor。
- [ ] 移除公開開發服務對 `x-actor-id` 的信任。
- [ ] 跑 `npm test && npm run typecheck && npm run build`。

### Task 2: Blnk 安全模式、最小權限金鑰與備份還原

**Files:**
- Modify: `deployment/blnk/secure-local.override.yaml`, `deployment/macos/run-public-api-development.sh`
- Create: `deployment/blnk/README.md`

**Acceptance:** Blnk 僅監聽本機私有介面、未帶金鑰回 401、公開 API 使用僅含 `transactions:write` 與 `balances:read` 的服務金鑰、備份後重啟資料不變。

- [x] 完成 Blnk secure mode 與本機連接埠限制。
- [x] 建立並驗證受限服務金鑰，主金鑰只存在 macOS 鑰匙圈。
- [x] 驗證備份校驗、容器健康、匿名拒絕與公開 API 健康。

### Task 3: CockroachDB 不可變帳本與資金不變量

**Files:**
- Modify: `services/ledger-api/migrations/*.sql`, `services/ledger-api/src/repositories/postgres-ledger-repository.ts`
- Test: `services/ledger-api/tests/integration/transfer-repository.test.ts`, `services/ledger-api/tests/migrations.test.ts`

**Acceptance:** 獨立測試資料庫的充值、站內轉帳、提款凍結/結算都能通過序列化併發與重試測試；除平台結算帳戶外，任何帳戶不可負數；每筆流水總和恆為零。

- [ ] 驗證獨立 `hidotpay_test` 資料庫權限與 migration runner。
- [ ] 寫入平衡、負數拒絕、重試與冪等性失敗測試。
- [ ] 補齊 migration 或 repository 中缺失的不變量。
- [ ] 執行 `npm run test:integration` 與完整回歸。

### Task 4: 自託管密鑰管理、簽名服務與權限隔離

**Files:**
- Create: `services/signer/`, `deployment/vault/`, `docs/security/custody-boundary.md`
- Test: `services/signer/tests/*.test.ts`

**Acceptance:** 地址衍生與簽名只能由簽名服務完成；一般 API 只可提出有政策限制的簽名請求；資料庫只存密鑰版本與衍生索引；每次簽名有審計記錄。

- [ ] 寫入「API 無法讀私鑰／超額或錯鏈簽名被拒絕」測試。
- [ ] 建立 Vault/KMS 包裝的密鑰版本與服務身分策略。
- [ ] 實作只支援明確鏈與交易類型的 signer policy。
- [ ] 在測試網驗證簽名而不開啟主網出金。

### Task 5: 用戶多鏈充值地址持久化登記與唯一性

**Files:**
- Create: `services/ledger-api/migrations/006_wallet_addresses.sql`
- Modify: `services/ledger-api/src/repositories/ledger-repository.ts`, `services/ledger-api/src/repositories/postgres-ledger-repository.ts`, `services/ledger-api/src/http/app.ts`
- Test: `services/ledger-api/tests/integration/wallet-addresses.test.ts`

**Acceptance:** 同一使用者同一鏈返回同一地址；不同使用者不可共用地址；併發配置只產生一個紀錄；停機重啟後地址不變；地址由 signer 的衍生索引產生，而非雜湊假地址。

- [ ] 寫入重複、併發、重啟與跨使用者衝突的失敗測試。
- [ ] 建立地址、鏈、帳戶、衍生索引、密鑰版本與狀態資料表。
- [ ] 以唯一索引和序列化交易配置地址。
- [ ] 執行測試資料庫與 API 端到端測試。

### Task 6: 鏈與資產政策登記、精度與合約白名單

**Files:**
- Modify: `services/ledger-api/migrations/003_chain_asset_policy.sql`
- Create: `services/ledger-api/src/chains/policy.ts`
- Test: `services/ledger-api/tests/chains/policy.test.ts`

**Acceptance:** 每條鏈/資產有唯一 network、asset、contract、decimals、確認門檻、啟用狀態與手續費資產；未知或非官方合約永遠不能入帳。

- [ ] 寫入錯誤 decimals、非白名單合約、停用資產的失敗測試。
- [ ] 將資產精度與官方合約資料化。
- [ ] 讓充值、提幣與 signer 共用同一政策讀取介面。
- [ ] 驗證 migration 與所有政策測試。

### Task 7: 可插拔多鏈適配器與 RPC 容錯

**Files:**
- Create: `services/ledger-api/src/chains/adapter.ts`, `services/ledger-api/src/chains/tron.ts`, `services/ledger-api/src/chains/evm.ts`
- Test: `services/ledger-api/tests/chains/adapter.test.ts`

**Acceptance:** 鏈適配器可列出地址、取得區塊、讀取代幣轉帳和廣播已授權交易；主 RPC 失敗會切換備援；RPC 回傳不可直接改變餘額。

- [ ] 寫入主 RPC 失敗、錯網路 ID、錯合約、重放區塊的失敗測試。
- [ ] 定義共同 adapter 介面與 TRON/EVM 實作。
- [ ] 設定健康檢查與 provider 優先順序。
- [ ] 以測試網 fixture 驗證容錯。

### Task 8: 鏈上充值觀測、確認門檻與可重試掃描

**Files:**
- Create: `services/deposit-worker/`, `services/ledger-api/migrations/007_chain_cursors.sql`
- Test: `services/deposit-worker/tests/scan.test.ts`

**Acceptance:** 工作程式可從持久 cursor 接續掃描；只有達到鏈/資產確認門檻的事件會進入候選入帳；重啟與重掃不遺漏或重覆處理。

- [ ] 寫入中斷、倒退區塊、少確認、重覆事件的失敗測試。
- [ ] 儲存區塊 cursor 和原始觀測資料。
- [ ] 用 adapter 掃描受監控地址並寫入 outbox。
- [ ] 執行 worker 重啟回歸。

### Task 9: 充值去重、重組處理與 Blnk/Cockroach 對帳

**Files:**
- Modify: `services/ledger-api/src/repositories/postgres-ledger-repository.ts`, `services/ledger-api/migrations/*.sql`
- Create: `services/reconciliation-worker/`
- Test: `services/ledger-api/tests/integration/deposit-reconciliation.test.ts`

**Acceptance:** `(network, transaction_hash, output_index)` 唯一；鏈重組前不最終入帳或能被隔離；同一確認事件重送只入帳一次；Blnk 與 Cockroach 的入帳 reference 可雙向比對。

- [ ] 寫入同交易重送、重組、對帳差異的失敗測試。
- [ ] 實作觀測、最終確認、入帳與對帳狀態機。
- [ ] 為每筆入帳保存兩個帳本 reference。
- [ ] 跑資料庫整合與 Blnk 測試環境驗證。

### Task 10: 站內免費轉帳與帳本原子一致性

**Files:**
- Modify: `services/ledger-api/src/services/transfer-service.ts`, `services/ledger-api/src/http/app.ts`
- Test: `services/ledger-api/tests/http/internal-transfers.test.ts`, `services/ledger-api/tests/integration/transfer-repository.test.ts`

**Acceptance:** 同資產、兩個可用帳戶間可即時轉帳；使用者只能扣自己的餘額；冪等重送不重扣；不足額、同帳戶、跨資產、越權全部拒絕；不觸發鏈上簽名或手續費。

- [ ] 寫入跨使用者、併發扣款與網路重送失敗測試。
- [ ] 對接正式帳戶選擇與 Blnk reference。
- [ ] 發布 `internal_transfer.committed` 事件。
- [ ] 跑併發整合測試。

### Task 11: 外部提幣凍結、雙人審批、簽名與廣播

**Files:**
- Modify: `services/ledger-api/src/services/funding-service.ts`, `services/ledger-api/src/http/app.ts`
- Create: `services/withdrawal-worker/`
- Test: `services/withdrawal-worker/tests/withdrawal.test.ts`

**Acceptance:** 提幣先凍結總額；申請人不可自行批准；只有批准且 signer policy 放行的交易才可廣播；鏈上確認後才結算；失敗能完整釋放凍結資金。

- [ ] 寫入自我審批、重送廣播、簽名拒絕、鏈上失敗的測試。
- [ ] 實作提幣狀態機與操作審計。
- [ ] 對接 signer 和 adapter，但主網 feature flag 預設關閉。
- [ ] 以測試網完成完整生命周期測試。

### Task 12: 手續費、限額、地址白名單與基礎風控

**Files:**
- Create: `services/ledger-api/src/services/risk-service.ts`, `services/ledger-api/migrations/008_risk_controls.sql`
- Test: `services/ledger-api/tests/services/risk-service.test.ts`

**Acceptance:** 手續費 quote 有有效期限；日限額、單筆限額、白名單冷卻期與可疑地址規則在簽名前強制執行；規則判定留下不可變審計紀錄。

- [ ] 寫入過期限 quote、超額、未成熟白名單與高風險地址的失敗測試。
- [ ] 儲存限額使用量、白名單和風控決策。
- [ ] 在提幣審批與 signer policy 前呼叫風控。
- [ ] 跑所有金融回歸測試。

### Task 13: Redpanda 事件外送與可靠投遞

**Files:**
- Create: `deployment/redpanda/`, `services/outbox-publisher/`
- Modify: `services/ledger-api/src/repositories/postgres-ledger-repository.ts`
- Test: `services/outbox-publisher/tests/publisher.test.ts`

**Acceptance:** 交易與資金資料先與 outbox 同交易提交；發布失敗可重試；消費者以 event id 去重；任何 queue 故障不可讓已提交帳本消失或重複入帳。

- [ ] 寫入 broker 斷線、重送與順序測試。
- [ ] 建立 topic、ACL、publisher 和消費端去重規則。
- [ ] 驗證 outbox 到 Redpanda 的端到端投遞。
- [ ] 驗證 broker 未影響帳本原子提交。

### Task 14: Temporal 工作流、補償與人工介入

**Files:**
- Create: `deployment/temporal/`, `services/workflows/`
- Test: `services/workflows/tests/*.test.ts`

**Acceptance:** 充值確認、提幣、風控升級與對帳差異有持久 workflow；任務重試不會重複入帳或重複廣播；需要人工處理時會停止在明確狀態而不是自動放行。

- [ ] 寫入 activity 超時、重試、補償與人工核准測試。
- [ ] 建立 deposit、withdrawal、reconciliation workflow。
- [ ] 綁定 Redpanda 事件與 workflow idempotency key。
- [ ] 使用 Temporal 測試環境跑完整流程。

### Task 15: NocoBase 管理後台、可觀測性與高可用部署

**Files:**
- Create: `deployment/nocobase/`, `deployment/kubernetes/`, `deployment/terraform/`, `docs/operations/`
- Test: `deployment/**/smoke-test.*`

**Acceptance:** 財務人員可用 NocoBase 查看用戶、地址、入帳、提幣、風控與不可變審計資料，但無法取得私鑰；所有服務有健康檢查、指標、告警、備份與還原演練；資料庫、事件、工作流與服務可跨可用區部署。

- [ ] 寫入未授權後台使用者、私鑰欄位曝露、備份還原和節點故障 smoke test。
- [ ] 以最小權限配置 NocoBase 資料來源與管理角色。
- [ ] 建立私有網路、密鑰注入、水平擴展、監控與備份基礎設施。
- [ ] 在隔離環境執行還原與單節點故障演練。

## Coverage Review

本計畫覆蓋使用者登入與角色、多鏈獨立地址、充值、雙式帳本、內部轉帳、外部提幣、手續費/風控、事件、工作流、NocoBase 後台與高可用部署。撮合交易、槓桿、合約、Swap、卡片與 Earn 仍不屬於本第一階段。
