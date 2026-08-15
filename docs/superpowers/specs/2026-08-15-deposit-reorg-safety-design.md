# 充值鏈重組安全設計

## 問題與目標

目前充值掃描器若發現已保存游標的區塊雜湊改變，會把重組範圍內的觀測標示為 `orphaned`。若其中觀測已經透過不可變帳本入帳，這個資料狀態改變不會自動沖正使用者可用餘額，可能留下沒有鏈上資產支撐的可花餘額。

本設計的目標是在可設定的重組安全範圍內，**絕不先入帳後回滾**。所有候選充值必須在超過重組視窗後才可進入帳本；偵測到超過視窗的深度重組時，系統必須失敗關閉並交由雙人覆核，不可自行扣款、沖正、改寫帳本或繼續掃描。

## 決策與理由

### 不採用自動沖正已入帳充值

自動從使用者可用帳戶扣回已失效充值並不安全：資產可能已經站內轉帳、進入 P2P 託管或申請提現，普通帳戶又禁止負數。強行沖正會讓雙式帳本、使用者可用餘額與後續交易互相矛盾。

### 採用安全水位（safe watermark）後才入帳

每輪掃描先取得鏈頭 `head`，只處理到：

```text
safe_head = head - reorg_window
```

只有 `block_height <= safe_head` 的事件才會通過資產確認門檻並呼叫私有 Ledger 充值 API。也就是一筆資金入帳時，確認數至少為 `reorg_window + 1`；實際資產政策仍可要求更高確認數。最後 `reorg_window` 個區塊永遠不入帳，也不寫成已完成游標。

這讓一般視窗內重組只影響尚未入帳的區塊，不再需要對已入帳餘額做不安全的事後補救。

### 深度重組一律停機

掃描器保存的游標代表已越過安全水位的區塊。下一輪若該高度的雜湊不同，表示重組已深入超過設定視窗；掃描器必須拋出明確 `deep_chain_reorg_detected` 錯誤、保持舊游標與既有觀測不變，並由監控告警和雙人金融覆核處理。

它不會呼叫 `invalidateFrom`、不會將已入帳觀測改成 `orphaned`、不會自動發出負數 posting，也不會保存新的游標。恢復前須以鏈上證據、`deposit_receipts`、`ledger_transactions`、餘額和 Blnk 對帳資料完成受控處置。

## 行為契約

### 掃描流程

1. 讀取 `head`，計算 `safeHead = head - reorgWindow`。
2. 如果 `safeHead < firstBlock`，回傳零候選，且不建立游標。
3. 若已有游標，先確認 `adapter.getBlockHash(cursor.height) === cursor.blockHash`。不相同即拋出 `deep_chain_reorg_detected`；不能清除、回退或改寫任何資料。
4. 從 `cursor.height + 1`（或 `firstBlock`）掃到 `min(safeHead, fromBlock + maxBlockRange - 1)`。
5. 每個事件必須同時符合官方資產／合約、目的地址、資產最小確認數和安全水位。成功後才以既有冪等 `network + transaction_hash + event_index` 呼叫 Ledger 入帳並標示 `credited`。
6. 只有整個區間成功處理後，才把游標保存到該區間末端的區塊雜湊。

### 觀測重放

正常運作下安全水位內不會產生已入帳後的重組。為處理舊部署留下的 `orphaned` 未入帳觀測，PostgreSQL upsert 若遇到相同事件且沒有對應 `deposit_receipts`，可把觀測安全恢復為候選並以新區塊資料更新；若存在已入帳 receipt，掃描器必須停機並要求人工處理，絕不靜默重試或自動沖正。

### 舊資料保護

啟動掃描前，資料庫 store 必須檢查是否存在 `status='orphaned'` 且可對應 `deposit_receipts` 的歷史觀測。若有，直接拒絕開始掃描並輸出不含個人資料的錯誤碼；這是未修補版本可能留下的資金差異，需先完成帳務覆核和雙人批准。

## 資料庫與 API 邊界

- 不新增任何「可變餘額」欄位，帳本交易和 `deposit_receipts` 維持唯一真相。
- 不更改一般使用者、App、NocoBase 或公開 API 的權限。
- 充值工作者仍只能透過私有 HTTPS Ledger endpoint，以鏈工作者身分送出已安全的官方資產事件。
- `invalidateFrom` 從正常掃描流程移除；若保留歷史 API，也必須不能把已入帳觀測改為 `orphaned`。

## 測試與驗收

1. 視窗內重組：候選事件尚未入帳，重新掃描新正史時只入帳一次。
2. 安全水位：距鏈頭少於或等於 `reorgWindow` 的事件不會呼叫 creditor，也不會前進游標到不安全區塊。
3. 深度重組：游標雜湊不符會停機；store、游標、credited 觀測與 creditor 呼叫次數均不變。
4. 舊 orphaned + receipt：啟動前被拒絕，且不會查詢／入帳新事件。
5. PostgreSQL 專用 `/hidotpay_test` 整合驗證：測試候選重放、既有 receipt 防護和游標資料完整性；沒有專用網址時安全跳過。
6. 回歸驗證：多鏈掃描、資產 allowlist、充值冪等、帳本平衡、Blnk 對帳與現有測試均不退化。

## 正式營運條件

此修正消除「設定重組視窗內先入帳後失效」的程式缺陷，但不取代正式鏈節點冗餘、告警、雙人覆核、金鑰隔離與測試網深度重組演練。任何 `deep_chain_reorg_detected` 或歷史 orphaned receipt 都是 P0 事故訊號；在人工帳務處置與第二人核准前，該網路不得恢復充值。
