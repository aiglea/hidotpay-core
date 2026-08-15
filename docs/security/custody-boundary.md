# HiDot Pay 資產託管安全邊界

使用者看到的餘額是 HiDot Pay 的中央託管帳本餘額，不是前端瀏覽器的自託管錢包。每個使用者可以有多條鏈的獨立充值地址；鏈上確認後才由不可變帳本把金額記入可用餘額。站內轉帳只改帳本，不上鏈，也不收鏈上 gas。外部提幣才會凍結餘額、經覆核、簽名與廣播，並收取明確報價的手續費。

```text
使用者 App ── Logto access token ──> ledger-api ──> CockroachDB / Blnk
                                             │
                                             └── 已核准的提款事件 ──> withdrawal-worker
                                                                           │ (mTLS, 私有網路)
                                                                           v
                                                             signer policy ──> OpenBao + Web3Signer/HSM
                                                                           │
                                                                           v
                                                                       鏈上 RPC
```

## 永遠不可跨越的界線

1. App、一般 API 與 NocoBase 不讀取也不傳遞私鑰。
2. 資料庫不保存明文私鑰、助記詞或恢復字；僅保存 key version、衍生索引及公開地址。
3. signer 只接受受信任提幣 worker 的結構化、已審批請求；不提供「任意資料簽名」端點。
4. signer 先檢查網路、資產、地址格式、限額、審批 reference 與主網開關，再碰到任何金鑰材料。
5. 每次簽名或拒絕都要留下不可變稽核紀錄；紀錄不能包含 payload 以外的秘密。

## 私有 signer HTTP 邊界

簽名服務只提供兩個私有 `POST` 路徑：`/v1/deposit-addresses` 與 `/v1/withdrawals/sign`。兩者都要求服務憑證；呼叫者身分由服務端固定，不接受 JSON 內的 `caller` 欄位。請求欄位採嚴格白名單，任何額外欄位（包含看似私鑰、seed 或任意交易資料）一律拒絕，也不會回顯。

帳本 Worker 必須以 `DEPOSIT_SIGNER` service binding 呼叫充值地址路徑，不得走公網。`SIGNER_DERIVATION_URL` 僅在沒有 binding 時作為後備，且必須精確指向 `/v1/deposit-addresses`。這個 HTTP 邊界本身不保存金鑰；部署時只能注入 account xpub 或經 HSM／Web3Signer 驗收的後端，測試用的記憶體簽名器不可被用於部署。

## 此版本的誠實狀態

充值地址可由隔離 Worker 以 account xpub 推導，帳本與 App 仍看不到種子或私鑰。這不是 HSM：主種子只存在操作者的離線／鑰匙圈備份，簽名器程序本身沒有私鑰。外部提領與任意資料簽名維持關閉，在完成 HSM／Web3Signer 與獨立安全審計前，不能宣稱已可保管真實用戶資產。
