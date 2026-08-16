# 第一階段完成度與正式上線缺口

更新日期：2026-08-16
適用版本：0.2.66

這份表把「程式已完成並驗證」和「外部環境已正式驗收」分開。任何標示為外部驗收未完成的項目，都表示不能開啟真實資產充值或提現。沒有第二人、沒有付費的 HSM／多區叢集，就不能宣稱「已可保管真實資產」。

## 已完成並有程式／資料庫驗證的項目

| 能力 | 目前結果 | 可回看證據 |
| --- | --- | --- |
| 帳戶登入與公開 API 身分邊界 | Logto token 必須符合簽發者與 API 對象；未登入請求不會建立錢包或連資料庫 | `services/ledger-api/tests/http/auth.test.ts`、`services/edge-api/tests/native-ledger-worker.test.mjs` |
| 不可變帳本 | 站內轉帳、充值、提現凍結與 P2P 託管均以平衡分錄保存；一般帳戶不可為負 | `services/ledger-api/tests/integration/transfer-repository.test.ts` |
| 獨立充值地址 | 同一使用者同一鏈得到穩定地址；不同使用者不共用；併發不會重複配置 | `services/ledger-api/tests/integration/wallet-addresses.test.ts` |
| 隔離充值簽名器 | 帳本只向簽名器索取公開地址；簽名器只持有 Ethereum／TRON account xpub；失敗回傳 `signer_unavailable`／`signer_rejected`，不含秘密 | `services/signer/tests/deposit-signer-worker.test.ts`、`services/ledger-api/tests/integrations/signer-address-deriver.test.ts`、`app/tests/wallet-api.test.mjs` |
| 多鏈充值觀測 | EVM 與 TRON 只處理已啟用官方資產，並依確認門檻、游標、重組視窗與事件去重入帳；掃描器只前進到安全水位，深度重組及歷史 `orphaned + receipt` 一律失敗關閉 | `services/deposit-worker/tests/*.test.ts`、`docs/operations/deposit-reorg-response.md` |
| 站內免費轉帳 | 已驗證只能扣自己的可用餘額、可重送不重扣、不會產生鏈上簽名或 gas | `services/ledger-api/tests/http/internal-transfers.test.ts` |
| 提現保護規則 | 預設拒絕提現；手續費報價、白名單冷卻、日限額、單筆限額與凍結規則已受測試覆蓋 | `services/ledger-api/tests/services/risk-service.test.ts`、`services/withdrawal-worker/tests/withdrawal-execution.test.ts` |
| P2P 託管 | 廣告、下單、鎖定、買家付款、賣家放幣、逾時退款、爭議仲裁和付款資訊遮罩均有角色與帳本測試 | `services/ledger-api/tests/http/p2p-orders.test.ts`、`services/ledger-api/tests/integration/p2p-order-repository.test.ts` |
| 可靠事件與工作流 | Outbox、Redpanda publisher、Temporal 工作流與 Blnk 對帳的重試／去重行為已測試 | `services/outbox-publisher/tests/*.test.ts`、`services/workflows/tests/*.test.ts`、`services/reconciliation-worker/tests/*.test.ts` |
| 低代碼後台唯讀投影 | 投影工作者只能讀指定 `admin_*` 檢視表並寫入可重建後台資料；實測投影服務不能讀取資料或使用者，財務檢視者不能寫入 | `services/admin-read-model-worker/tests/*.test.ts`、`deployment/nocobase/read-model-role.test.mjs`、`deployment/nocobase/smoke-read-model.sh` |
| 測試網入帳路徑 | 原生 Worker 有 fail-closed 的 `POST /v1/deposits/confirmed`：只接受 `CHAIN_OPERATOR_TOKEN` 服務身分，拒絕終端使用者 JWT、`x-actor-id` 與瀏覽器 Origin；主網與非正式網路在寫入前拒絕；同一觀測重送不重複入帳 | `services/edge-api/tests/native-deposit-credit.test.mjs`、`services/ledger-api/tests/services/funding-service-deposit.test.ts` |
| CockroachDB 遷移安全 | 空白資料庫已完成 18 個 migration（含官方 Sepolia／Shasta USDT 政策種子）；線上欄位回填採逐條執行且可安全重跑；專用測試帳號獲得既有和日後 migration 資料表權限 | `services/ledger-api/tests/migration-runner.test.ts`、`services/ledger-api/tests/migrations.test.ts`、`services/ledger-api/tests/test-database-privileges.test.ts` |

## 已部署、但仍是封閉候選環境的項目

| 項目 | 現況 | 為何尚不能當成正式資金環境 |
| --- | --- | --- |
| 錢包 UI | `hidotpay-wallet-ui` 已部署；登入走 Logto；失效 refresh token 會清掉本機登入；空餘額會說明等待第一筆測試網入帳 | 這是測試網錢包，不是主網。P2P 前台未接 |
| 原生帳本 Worker | `hidotpay-native-ledger-staging`：`/healthz` 200、未登入 401、`LEDGER_API_ENABLED=true`、`WITHDRAWALS_ENABLED=false`、已有 `/v1/deposits/confirmed` | 這是 staging／測試網候選，不是主網資金入口 |
| 測試網掃描器 | `hidotpay-deposit-scanner-staging` 每分鐘掃描 Sepolia／Shasta 公開 RPC，經 service binding 入帳；無游標時錨在安全水位，不回補歷史 | 公開 RPC 可能限流或短暫失敗；沒有付費私有 RPC。Sepolia「USDT」不是 Tether 官方發行。尚未用真實測試幣走完一筆端到端入帳 |
| 充值簽名器 | `hidotpay-deposit-signer-staging` 只回公開地址；帳本以 `DEPOSIT_SIGNER` service binding 呼叫，不走公網 | 持有的是 account xpub，不是 HSM。主種子只在操作者鑰匙圈。不能保管真實資產 |
| CockroachDB Cloud | 已有隔離測試／staging 資料庫；本機投影工作者可讀 `admin_*` 檢視 | 尚未取得多區域正式集群、備份與還原演練證據 |
| NocoBase | 本機 `http://127.0.0.1:13000` Compose 健康；管理者可登入；六個投影集合與財務唯讀角色可重跑；投影一次成功 | 私有開發後台。尚未 VPN／HTTPS 正式網路、雲端密鑰服務、備份還原與第二人驗收 |
| Blnk | 本機私有部署與受限服務金鑰流程已準備 | 尚未有多副本、私有網路、備份還原與 CockroachDB 實際抽樣對帳證據 |

## 正式上線仍缺少的外部驗收

以下依風險排序；第一項完成前，所有真實資產開關都必須保持關閉。

### 已修正程式 P0，但仍是發布關卡

**充值鏈重組安全**：安全水位、深度重組失敗關閉與歷史 `orphaned + receipt` 防護已完成程式修正；正常流程不會自動扣減使用者、寫入反向 posting 或改寫不可變總帳。惟**專用 `hidotpay_test` 真實資料庫驗證仍是發布關卡**；在該證據、雙人事故恢復演練及後述外部 P0 門檻完成前，不得發布此分支為主網候選、恢復受影響網路掃描或啟用任何真實充值。事故處置依 `docs/operations/deposit-reorg-response.md` 執行。

### P0：必須先完成（會被外部帳號／費用擋住）

1. **正式簽名器與金鑰隔離**：Turnkey 或同等 HSM／Web3Signer 需操作者註冊並付費。在那之前 `WITHDRAWALS_ENABLED=false`。xpub 充值簽名器不是提領簽名器。
2. **正式資料保護**：CockroachDB 多可用區正式集群、加密備份、還原演練與告警。Blnk 亦需私有網路與可還原多副本。
3. **真實 Logto 權限驗收**：用一般使用者、鏈上工作程式、財務覆核員、仲裁員四種真實 token 實測允許與拒絕，並保存結果。
4. **雙人變更制度**：兩個不同職責的人完成簽名、風控、白名單、限額、測試網週期與回滾證據覆核後，才可評估開啟主網資金開關。
5. **真實測試幣入帳演練**：程式與公開 RPC 掃描已接上；仍缺操作者用自己的測試 USDT 打到已配置地址、看到餘額更新的現場紀錄。這不是主網驗收。

### P1：與 P0 並行完成

1. **P2P 前台**：後端狀態機已在；錢包主流程這一輪刻意不上 P2P UI。
2. **事件與工作流高可用**：Redpanda 三 broker 跨可用區；Temporal HA；實測故障重送。
3. **管理後台正式化**：把已驗證的本機 NocoBase 投影放到私有 HTTPS／VPN；不得讓 NocoBase 直連或寫入帳本。
4. **監控與事故演練**：帳本不平衡、對帳差異、未確認提現、重複交易雜湊、outbox 堆積、工作流失敗、備份失敗與簽名拒絕的告警；至少一次可用區故障及一次完整還原演練。

### P2：使用者產品完成度

1. **錢包 App**：登入後具備餘額、獨立充值地址、站內轉帳與只讀交易紀錄的受保護介面；未設定 API 時不產生假資料。P2P 介面仍未完成。
2. **Figma 對照實作**：指定節點仍無法讀取前，不宣稱像素級還原。
3. **真實操作驗收**：以真實登入帳戶完成「查看餘額 → 取得測試網充值地址 → 確認入帳 → 站內轉帳 → P2P 託管 → 超時退款」。所有資產均限測試環境。

## 下一次迭代與報報條件

| 下一輪工作 | 我可以先做的 | 會被你擋住、不能假裝完成的 |
| --- | --- | --- |
| 真實測試幣入帳 | 掃描器與入帳路徑已在；可協助對帳一筆公開測試網轉帳 | 你從自己的測試錢包轉出 Sepolia／Shasta 測試 USDT |
| P2P UI | 依現有狀態機做錢包前台，不上主網 | 無；可在下一輪直接做 |
| Turnkey／HSM 提領 | 維持 `WITHDRAWALS_ENABLED=false`；接好失敗關閉介面 | 你註冊並付費 Turnkey／HSM，並指定第二覆核人 |
| 多區資料庫 | 寫遷移與權限；不把單區 staging 標成正式 | 你建立並付費 Cockroach 多可用區叢集，完成備份還原演練 |

主網開關在上述證據齊全前保持關閉。

## 發布前最小證據清單

每個候選版本至少保留以下命令的成功紀錄：

```sh
npm test
npm run typecheck
npm run build
npm run verify:docs
npm run test:integration
HIDOTPAY_NOCOBASE_APP_KEY=檢查值 HIDOTPAY_NOCOBASE_DB_PASSWORD=檢查值 sh deployment/nocobase/smoke-test.sh
sh deployment/kubernetes/smoke-test.sh
sh deployment/terraform/smoke-test.sh
```

這些成功紀錄證明程式與設定品質；不取代本文件 P0／P1 所列的外部環境、演練與第二人覆核。
