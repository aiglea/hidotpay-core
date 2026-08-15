# Blnk 對接現況審查

審查日期：2026-08-15  
結論：**部分完成；不可宣稱為完整 Blnk 核心帳本或正式資金部署。**

## 已實作且可回查

1. `BlnkLedgerClient` 會以 CockroachDB 不可變 `ledger_transaction_id` 生成穩定 reference，將已確認的鏈上充值寫入 Blnk，網路中斷時先依 reference 查詢，避免重複建立 Blnk 交易。
2. `DepositReconciliationWorker` 以租約取得待處理充值，接受 `APPLIED`、`QUEUED`、`INFLIGHT` 三種安全狀態；Blnk 不可用時保留 CockroachDB 已入帳資料，等待重試，不會重新給使用者加餘額。
3. 本機 Blnk 設定強制受限 API key、主金鑰不寫入 Git，且只綁定 loopback。

對應程式：

- `services/ledger-api/src/integrations/blnk-ledger.ts`
- `services/reconciliation-worker/src/deposit-reconciliation.ts`
- `deployment/blnk/secure-local.override.yaml`

## 與目標的差距

| 要求 | 實際狀態 | 是否可當正式資金證據 |
| --- | --- | --- |
| 所有資金交易有可重建副帳本 | 目前只鏡像 `deposit_credit`；站內轉帳、提款凍結／釋放／結算、P2P 託管並未進 Blnk 對帳流程 | 否 |
| Blnk 高可用 | 僅有本機 Compose overlay；沒有正式私有網路、多副本、備份還原或故障演練 | 否 |
| Blnk 金鑰隔離 | 本機 keychain 有最小權限範例；正式密鑰服務與輪替證據不存在 | 否 |
| Blnk 與主帳本零差異 | 有單筆充值 reference 對帳；沒有全交易類型抽樣／日結差異報告 | 否 |
| 完整 Blnk 核心帳本 | CockroachDB 才是不可變資金真相；Blnk 被刻意設計為可恢復的副帳本 | 否，且不可把 Blnk 餘額拿來覆寫主帳本 |

## 架構決策

HiDot Pay 保留 **CockroachDB 不可變雙式總帳為唯一資金真相**，Blnk 為獨立、可重建的副帳本與對帳邊界。原因是目前 Blnk 部署本身有獨立資料庫、佇列與可用性邊界；把同一筆資金同步寫入兩個服務而不做可靠 outbox／冪等消費，會產生雙寫不一致風險。

這個決策不等於 Blnk 對接已完成。正式候選版必須先讓每一筆已 committed 的 `ledger_transactions` 都經可靠 outbox 產生單一 Blnk mirror 任務，以不可變 transaction ID 作 reference；Blnk 延遲或故障不能改變使用者在 CockroachDB 的可用餘額，但對帳差異必須告警並阻斷相關資金開關。

## 必做改造與驗收

1. 建立通用 `ledger.committed` outbox 事件，覆蓋充值、站內轉帳、提款凍結／釋放／結算與 P2P 託管分錄；事件 payload 只帶 transaction ID，不帶可改寫金額或帳戶資料。
2. 在私有對帳 worker 依 transaction ID 從 CockroachDB 讀取不可變 posting，建立 deterministic Blnk reference，並安全重試／查詢既有 reference。
3. 設計每種 HiDot Pay 帳戶到 Blnk balance indicator 的固定映射；平台帳戶允許的負數必須明確限定，使用者可用／凍結帳戶不得在 Blnk 使用 overdraft。
4. 為每一種交易建立「Cockroach postings 平衡、Blnk transaction reference 唯一、重送不重鏡像、Blnk 故障不重複移動使用者餘額」的測試；以專用 `/hidotpay_test` 資料庫進行真實整合驗證。
5. 部署 Blnk 前完成私有網路、最小權限 key、備份還原、監控與抽樣差異報告；正式密鑰不在 Worker、App、NocoBase 或 Git 中。

## 官方文件核對

Blnk 官方文件說明可用 Docker Compose 自託管或使用 Managed Core，交易採雙式來源與目的帳戶，並以 `reference` 作業務識別；交易可能先回 `QUEUED`，須在完成後查詢最終狀態。因此目前「主帳本先 committed、再以 reference 對帳」的基本方向正確，但只覆蓋充值不足以完成完整對接。
