# Logto Figma 自訂登入體驗設計

日期：2026-08-15
狀態：已依產品授權定稿，尚未啟用

## 目標

讓 hidotpay 的登入與註冊畫面沿用指定 Figma 的白底、亮綠主操作與紫色品牌層次，同時保留 Logto 的 OIDC 登入安全模型。使用者從 hidotpay Wallet 點擊登入或建立帳戶後，會進入由 Logto Cloud 託管的自訂登入頁；成功後仍依原本授權碼流程回到 Wallet。

## 不做的事

- 不在 Wallet App、Cloudflare Worker 或自建 API 收集、驗證、記錄密碼、驗證碼或重設憑證。
- 不使用不存在的「無頭登入 API」，也不使用 Resource Owner Password 流程。
- 不把 Logto 管理 Token、Cloudflare Token、私鑰、助記詞、資料庫網址或 API 金鑰編進前端檔案。
- 不把未驗證的內部轉帳、提現或 P2P 入口加入第一期使用者 UI。

## 架構

```text
Wallet Figma 前台
  └─ Logto OIDC 授權請求（登入或註冊首畫面）
       └─ Logto Cloud 的 hidotpay 自訂登入 SPA
            └─ Logto Experience API（同一個登入互動工作階段）
                 └─ 授權碼回到 Wallet callback
```

自訂登入 SPA 從 Logto 官方 `packages/experience` 開始，而不是自建一套帳號系統。它保留官方的帳號識別、密碼策略、電子郵件驗證、重設密碼、MFA、CAPTCHA 與錯誤處理流程；hidotpay 只替換視覺 Token、版面和文案。每次升級 Logto 時，先將官方安全流程同步到獨立分支，再重新套用小範圍的 hidotpay 主題修改並跑完整登入回歸。

## Figma 對應

- 登入：Figma `1019:16022`。
- 註冊：Figma `1019:15897`。
- 保留第一期 Wallet 既有的亮綠主要按鈕、深色文字、紫色品牌色與白底；真正輸入帳密的控制項會在 Logto Experience 中呈現。
- 會做登入、註冊、載入、欄位錯誤、忘記密碼、驗證碼、CAPTCHA、MFA 與小螢幕版面，避免只美化第一張登入圖卻讓其餘驗證頁退回預設風格。

## 發布與回滾

1. 使用 Logto 官方專案產生 production `dist`；ZIP 的根目錄必須包含 `index.html`。
2. 在隔離登入測試環境跑 Logto Tunnel 與測試帳戶驗收，確認登入、註冊、錯誤、重設、回呼與登出。
3. 檢查 ZIP 未含機密、檔案數與大小符合 Logto 限制，且 CSP 只允許必要的 HTTPS 來源；第一期不加入第三方分析或外部 API。
4. 以 Logto CLI 可重現上傳；上傳會立即影響租戶登入，因此只在驗收完成後對正式租戶啟用。
5. 發布前保存目前的已驗證 ZIP 與其雜湊；若驗收失敗，從 Logto Console 刪除 Bring your UI 即可回復內建登入體驗。

## 驗收標準

- App 的「登入」與「建立帳戶」分別進入自訂的登入／註冊首畫面，完成後回到正確的 `/callback`。
- 自訂頁每個登入與註冊流程都透過 Logto Experience API；瀏覽器網路請求中沒有 hidotpay 自建密碼 API。
- 密碼、驗證碼、重設與 MFA 在啟用的租戶設定下可以正常完成；不支援的方法會安全地不顯示。
- 375px 與 1440px 畫面沒有水平溢出、按鈕不可被裁切，鍵盤操作與錯誤訊息可讀。
- 所有前端與官方 Experience 修改均通過測試、型別檢查、production build、ZIP 結構與公開登入回呼驗證。
- 真實資產與提現開關不因登入 UI 發布而改變。
