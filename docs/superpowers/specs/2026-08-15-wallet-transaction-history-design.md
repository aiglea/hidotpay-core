# 使用者錢包交易紀錄設計

## 目標

讓已登入使用者可在錢包中查閱自己的帳本流水，而不會看見其他使用者、對手方、付款方式、私鑰或內部風控資料。這項工作只新增唯讀功能；不改動帳本規則、不開啟充值或提現開關。

## 範圍與非範圍

本次包含：

- `GET /v1/me/transactions` 的受保護唯讀 API。
- 以登入者的可用錢包帳戶為唯一查詢來源；客戶端不得提交帳戶 ID。
- 以游標分頁查詢已提交帳本交易，預設 20 筆、最大 50 筆。
- App 顯示載入中、空白、錯誤、下一頁與交易方向。
- 更新 OpenAPI、操作文件及自動測試。

本次不包含：

- 真實資金開關、鏈上廣播、私鑰／助記詞、交易對手資料、付款方式資料、管理者查詢 API。
- 對歷史資料做回填、變更帳本 schema，或把 NocoBase 變成帳本寫入者。

## 可選方案與決策

1. **由 App 傳入帳戶 ID，再由 API 檢查所有權。** 雖能重用既有帳戶 API，但容易讓使用者誤以為可選擇其他帳戶，且增加授權邊界。
2. **只允許 `/v1/me/transactions`，由服務端以登入者建立／取得錢包。** 帳戶選擇完全在服務端，與餘額和充值地址 API 一致；採用此方案。
3. **直接讓 App 讀 NocoBase 投影。** 投影具延遲且本質為後台資料，不能作為使用者資產真相；不採用。

## API 契約

### 請求

`GET /v1/me/transactions?limit=20&cursor=<opaque>`

- 需要 Logto access token，沿用現有公開 API 的 audience／issuer 驗證。
- `limit` 缺省為 `20`，只能是 `1` 至 `50` 的十進位整數。
- `cursor` 是上一頁 `next_cursor` 的不透明值；格式錯誤一律回傳既有的驗證錯誤，不會改為 offset 查詢。

### 回應

```json
{
  "transactions": [
    {
      "id": "UUID",
      "type": "internal_transfer",
      "asset_code": "USDT",
      "amount_atoms": "1000000",
      "direction": "outgoing",
      "created_at": "2026-08-15T00:00:00.000Z"
    }
  ],
  "next_cursor": "opaque-or-null"
}
```

- 只取登入者 **可用帳戶** 的 posting；同一帳本交易只會出現一次。
- `amount_atoms` 永遠是正整數字串；`direction` 由伺服器以 posting 的正負決定，不能由客戶端指定。
- 交易類型維持目前帳本類型名稱；App 把已知類型翻成繁體中文，未知類型顯示中性的「帳本交易」。
- 不回傳 `actor_id`、對方帳戶、帳本 metadata、付款資料、鏈上目的地、交易雜湊或稽核欄位。
- 排序為 `created_at DESC, id DESC`。游標同時保存這兩個排序鍵，避免相同時間戳造成重複或漏資料。

## 資料層

`LedgerRepository` 新增 `listWalletTransactions(accountId, page)`。PostgreSQL 實作以 `ledger_postings` 和 `ledger_transactions` 連結，條件固定為服務端給出的可用帳戶 UUID；使用 keyset（seek）查詢與 `limit + 1` 偵測下一頁。記憶體實作保存已套用帳本交易，使 HTTP 測試與資料庫實作遵守同一契約。

游標採 base64url 編碼的 `{ createdAt, id }`，只承載排序鍵；解析時驗證 ISO 時間與 UUID。游標不包含帳戶、使用者、金額或任何授權資訊，因此仍由服務端帳戶條件決定可見資料。

## App 互動

錢包首頁初次讀取餘額後，同步讀取第一頁交易。交易卡片顯示資產、格式化金額、入帳／出帳、類型與本地化時間。空白時明確表示尚無已確認帳本紀錄；錯誤時可重新整理；有下一頁時顯示「載入更多」。未設定受保護 API 時維持目前的保護訊息，不造假資料。

## 錯誤與安全

- 使用者沒有 access token、傳入無效 limit／cursor、或帳戶資料不存在時，沿用既有認證與領域錯誤處理。
- API 與 App 只接受 HTTPS，並使用現有精確 CORS 網域白名單。
- 所有交易歷史請求為 GET，不使用 idempotency key，且不寫入任何資料。
- 前端不得從交易資料推斷或顯示收款人、付款方式或鏈上敏感資訊。

## 驗收證據

1. HTTP 測試證明登入者只能看到自己的交易，不能透過查詢參數指定他人帳戶。
2. 測試覆蓋入帳與出帳方向、正整數金額、穩定排序、游標第二頁、錯誤 cursor／limit。
3. PostgreSQL 整合測試以專用測試資料庫驗證帳本 transaction/posting 查詢與游標。
4. App 測試驗證 Bearer token、正確 URL、交易 mapping 與不安全 HTTP 拒絕。
5. UI 實際渲染檢查登入、載入、空白、錯誤、長交易清單及窄螢幕狀態。

## 正式上線邊界

本設計不消除 `docs/phase-1-gaps.md` 的 P0／P1 門檻。Logto 正式 API Resource、精確正式網域 CORS、隔離簽名器、多區資料保護、雙人覆核與測試網演練仍必須先完成，才能開啟真實資產流程。
