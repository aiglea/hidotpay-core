# 第一階段完成度與正式上線缺口

更新日期：2026-08-15
適用版本：0.2.54 起

這份表把「程式已完成並驗證」和「外部環境已正式驗收」分開。任何標示為外部驗收未完成的項目，都表示不能開啟真實資產充值或提現。

## 已完成並有程式／資料庫驗證的項目

| 能力 | 目前結果 | 可回看證據 |
| --- | --- | --- |
| 帳戶登入與公開 API 身分邊界 | Logto token 必須符合簽發者與 API 對象；未登入請求不會建立錢包或連資料庫 | `services/ledger-api/tests/http/auth.test.ts`、`services/edge-api/tests/native-ledger-worker.test.mjs` |
| 不可變帳本 | 站內轉帳、充值、提現凍結與 P2P 託管均以平衡分錄保存；一般帳戶不可為負 | `services/ledger-api/tests/integration/transfer-repository.test.ts` |
| 獨立充值地址 | 同一使用者同一鏈得到穩定地址；不同使用者不共用；併發不會重複配置 | `services/ledger-api/tests/integration/wallet-addresses.test.ts` |
| 多鏈充值觀測 | EVM 與 TRON 只處理已啟用官方資產，並依確認門檻、游標、重組視窗與事件去重入帳 | `services/deposit-worker/tests/*.test.ts` |
| 站內免費轉帳 | 已驗證只能扣自己的可用餘額、可重送不重扣、不會產生鏈上簽名或 gas | `services/ledger-api/tests/http/internal-transfers.test.ts` |
| 提現保護規則 | 預設拒絕提現；手續費報價、白名單冷卻、日限額、單筆限額與凍結規則已受測試覆蓋 | `services/ledger-api/tests/services/risk-service.test.ts`、`services/withdrawal-worker/tests/withdrawal-execution.test.ts` |
| P2P 託管 | 廣告、下單、鎖定、買家付款、賣家放幣、逾時退款、爭議仲裁和付款資訊遮罩均有角色與帳本測試 | `services/ledger-api/tests/http/p2p-orders.test.ts`、`services/ledger-api/tests/integration/p2p-order-repository.test.ts` |
| 可靠事件與工作流 | Outbox、Redpanda publisher、Temporal 工作流與 Blnk 對帳的重試／去重行為已測試 | `services/outbox-publisher/tests/*.test.ts`、`services/workflows/tests/*.test.ts`、`services/reconciliation-worker/tests/*.test.ts` |
| 低代碼後台唯讀投影 | 投影工作者只能讀指定 `admin_*` 檢視表並寫入可重建後台資料；實測投影服務不能讀取資料或使用者，財務檢視者不能寫入 | `services/admin-read-model-worker/tests/*.test.ts`、`deployment/nocobase/read-model-role.test.mjs`、`deployment/nocobase/smoke-read-model.sh` |
| CockroachDB 遷移安全 | 空白資料庫已完成 17 個 migration；線上欄位回填採逐條執行且可安全重跑；專用測試帳號獲得既有和日後 migration 資料表權限 | `services/ledger-api/tests/migration-runner.test.ts`、`services/ledger-api/tests/migrations.test.ts`、`services/ledger-api/tests/test-database-privileges.test.ts` |

## 已部署、但仍是封閉候選環境的項目

| 項目 | 現況 | 為何尚不能當成正式資金環境 |
| --- | --- | --- |
| Cloudflare Worker | `hidotpay-native-ledger-staging` 已部署，健康檢查正常，未登入請求會被拒絕 | `LEDGER_API_ENABLED=false`、`WITHDRAWALS_ENABLED=false`；它只驗證邊緣入口，不會持有或簽名私鑰 |
| CockroachDB Cloud | 已有隔離測試資料庫並完成真實整合測試 | 尚未取得多區域正式集群、獨立最小權限帳號、備份與還原演練證據 |
| NocoBase | 本機 Compose、可重跑投影集合、受限投影服務角色與財務檢視者角色均已實測 | 尚未在私有正式網路完成 HTTPS、VPN／身分閘道、雲端密鑰服務、備份還原與實際管理者驗收 |
| Blnk | 本機私有部署與受限服務金鑰流程已準備 | 尚未有多副本、私有網路、備份還原與 CockroachDB 實際抽樣對帳證據 |

## 正式上線仍缺少的外部驗收

以下依風險排序；第一項完成前，所有真實資產開關都必須保持關閉。

### P0：必須先完成

1. **正式簽名器與金鑰隔離**：部署至少三節點 OpenBao、TLS、Raft、高可用解封與不可修改稽核紀錄；EVM 使用經驗收的 HSM／Web3Signer，TRON 使用相同等級的隔離 secp256k1 簽名方案。完成測試網地址、簽名、廣播、確認、失敗、重送與輪替演練，並取得獨立安全審計簽核。
2. **正式資料保護**：建立 CockroachDB 多可用區正式集群、應用程式／NocoBase 分離帳號、加密備份、還原演練與告警。Blnk 亦需私有網路、最小權限金鑰與可還原多副本。
3. **真實 Logto 權限驗收**：用一般使用者、鏈上工作程式、財務覆核員、仲裁員四種真實 token 實測允許與拒絕情況，並保存結果。
4. **雙人變更制度**：兩個不同職責的人完成簽名、風控、白名單、限額、測試網週期與回滾證據覆核後，才可評估開啟帳本 API；提現開關仍需另一份獨立核准。

### P1：與 P0 並行完成

1. **事件與工作流高可用**：Redpanda 三 broker 跨可用區、TLS/SASL/ACL、複寫因子 3；Temporal Cloud 或官方 HA 部署，並實測 broker／worker 故障下的重送與人工復原。
2. **管理後台正式化**：在私有網路啟動 NocoBase，注入受限投影服務的 CockroachDB 唯讀帳號、CA 與 API 金鑰，完成 HTTPS、備份還原與財務管理者實測；不得改用 NocoBase 直接連線或寫入帳本。
3. **監控與事故演練**：為帳本不平衡、對帳差異、未確認提現、重複交易雜湊、outbox 堆積、工作流失敗、備份失敗與簽名拒絕建立告警；至少完成一次可用區故障及一次完整還原演練。

### P2：使用者產品完成度

1. **錢包 App**：登入後已具備餘額、獨立充值地址、站內轉帳與只讀交易紀錄的受保護介面；未設定 API 時明確顯示保護狀態，不產生假資料。P2P 介面及實際已授權 API 端到端驗收仍未完成。
2. **Figma 對照實作**：目前 Figma 連線尚未提供指定節點的設計內容；在可讀取節點後，才可進行逐項視覺比對與驗收，不應以猜測畫面取代原設計。
3. **真實操作驗收**：以真實登入帳戶完成「查看餘額 → 取得測試網充值地址 → 確認入帳 → 站內轉帳 → P2P 託管 → 超時退款」的端對端演練；所有資產均限測試環境。

## 下一個可交付任務

下一個可交付項目是 **正式 Logto API Resource、HTTPS／CORS allowlist 驗收與真實登入的測試網錢包演練**；這些外部環境證據完成後，才能驗收餘額、地址、交易紀錄與站內轉帳的端到端流程。之後再完成 P2P 使用者介面；兩者都不會碰觸私鑰或開啟主網提現。

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
