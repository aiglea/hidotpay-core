# Logto API 資源設定

HiDot Pay 的一般使用者 API 必須只接受 Logto 發出的 access token；ID token、前端自訂使用者 ID 或開發金鑰都不可作為正式 API 憑證。

## 目前狀態

程式已要求下列 issuer 與 audience：

- issuer：`https://ngu7sy.logto.app/oidc`
- API resource indicator：`https://api-dev.hidotpay.com`

2026-08-16 staging 錢包與原生帳本已使用此 API Resource。一般使用者可取得符合 audience 的 access token。這不表示四種角色（一般使用者、財務覆核員、鏈上工作程式、仲裁員）的允許／拒絕矩陣已保存，也不表示可開主網。

## 仍須完成的設定與驗收

1. 確認 Logto Console 的 API 資源識別碼仍為 `https://api-dev.hidotpay.com`。
2. 確認最小權限：`wallet:read`、`wallet:write`、`finance:review`、`chain:operate`。
3. 確認角色只授予必要權限：一般使用者只給 `wallet:read`、`wallet:write`；財務覆核員給 `finance:review`；鏈上工作程式只使用 M2M 身分與 `chain:operate`。
4. 在 Web 與 Native LogtoProvider 加入這個 resource，前端呼叫 API 時以 `getAccessToken('https://api-dev.hidotpay.com')` 取得 access token，並送出 `Authorization: Bearer <token>`。
5. 部署 API 時設定 `LOGTO_ISSUER` 和 `LOGTO_AUDIENCE`；移除 `DEVELOPMENT_API_KEY`、`x-actor-id` 與 `x-actor-roles` 的公開使用方式。
6. 用一般使用者、覆核員、M2M 鏈上 worker 各自測試：錯誤 audience、過期 token、偽造 role、越權呼叫都必須被拒絕。

## 不能省略的原因

Logto 的 API resource 會把 token 的 audience 綁定到 HiDot Pay API；伺服器再驗簽、檢查 issuer、有效期限與 scope。這樣前端不能靠偽造 header 冒充其他使用者或鏈上工作程式。
