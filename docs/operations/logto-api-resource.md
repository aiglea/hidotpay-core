# Logto API 資源設定

HiDot Pay 的一般使用者 API 必須只接受 Logto 發出的 access token；ID token、前端自訂使用者 ID 或開發金鑰都不可作為正式 API 憑證。

## 目前狀態

程式已要求下列 issuer 與 audience：

- issuer：`https://ngu7sy.logto.app/oidc`
- API resource indicator：`https://api-dev.hidotpay.com`

2026-08-14 已在 Logto Cloud 控制台確認目前租戶的免費方案 API 資源額度為 0。因此在升級為支援 API resource 的方案，或遷移為自託管 Logto 前，**不得部署啟用 JWT 強制驗證的公開開發 API**；否則使用者不能取得符合 audience 的 access token。

## 取得方案後的設定步驟

1. 在 Logto Console 開啟「API 資源」並建立：名稱「HiDot Pay 開發 API」、識別碼 `https://api-dev.hidotpay.com`。
2. 建立最小權限：`wallet:read`、`wallet:write`、`finance:review`、`chain:operate`。
3. 建立角色並只授予必要權限：一般使用者只給 `wallet:read`、`wallet:write`；財務覆核員給 `finance:review`；鏈上工作程式只使用 M2M 身分與 `chain:operate`。
4. 在 Web 與 Native LogtoProvider 加入這個 resource，前端呼叫 API 時以 `getAccessToken('https://api-dev.hidotpay.com')` 取得 access token，並送出 `Authorization: Bearer <token>`。
5. 部署 API 時設定 `LOGTO_ISSUER` 和 `LOGTO_AUDIENCE`；移除 `DEVELOPMENT_API_KEY`、`x-actor-id` 與 `x-actor-roles` 的公開使用方式。
6. 用一般使用者、覆核員、M2M 鏈上 worker 各自測試：錯誤 audience、過期 token、偽造 role、越權呼叫都必須被拒絕。

## 不能省略的原因

Logto 的 API resource 會把 token 的 audience 綁定到 HiDot Pay API；伺服器再驗簽、檢查 issuer、有效期限與 scope。這樣前端不能靠偽造 header 冒充其他使用者或鏈上工作程式。
