# 公網開發版

開發 API 使用 `https://api-dev.hidotpay.com`。Cloudflare Tunnel 保持本機不開放任何入站連接埠，流量只會轉到本機 `127.0.0.1:3001`。

## 保護方式

- 健康檢查：`GET /healthz` 可公開讀取，用來確認服務是否在線。
- 其他 API：必須帶上 `X-HidoTPay-Dev-Key`；這把鑰匙只放在這台 Mac 的鑰匙圈，不能提交到 Git 或傳到前端。
- 正式環境仍採 Logto JWT，不使用此開發鑰匙。

## 自動啟動

macOS 登入後，`com.hidotpay.ledger-api-development` 會自動啟動並在意外停止後重啟。資料庫連線與開發鑰匙都從 macOS 鑰匙圈讀取。

## 驗證方式

```text
https://api-dev.hidotpay.com/healthz
```

預期回傳：`{"status":"ok"}`。

這是開發公開環境，只接真實的開發資料庫；不可填入真實客戶資金或私鑰。
