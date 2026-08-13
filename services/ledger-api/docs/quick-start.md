# 快速開始

## 你需要先準備

1. CockroachDB Cloud 的一個開發叢集。
2. 另一個**只給自動測試使用**的資料庫，名稱建議 `hidotpay_test`。
3. Logto 的 API Resource identifier 與 Issuer（正式環境必填）。

## 本機設定

1. 複製 `services/ledger-api/.env.example` 為 `services/ledger-api/.env`。
2. 填入兩條連線字串：
   - `DATABASE_URL`：開發或正式帳本資料庫。
   - `HIDOTPAY_TEST_DATABASE_URL`：**另一個**測試資料庫，絕不能與前者相同。
3. 執行 `npm run db:migrate` 建立資料表。
4. 執行 `npm run start:ledger`，服務會在 `http://127.0.0.1:3001` 啟動。

## 驗證

```bash
npm test
HIDOTPAY_TEST_DATABASE_URL='你的專用測試連線字串' npm run test:integration
npm run typecheck
npm run build
```

整合測試只認 `HIDOTPAY_TEST_DATABASE_URL`，不會讀取 `DATABASE_URL`。這是刻意設計，避免測試資料誤寫到正式帳本。

在 CockroachDB Cloud 的 SQL 介面先執行一次 `CREATE DATABASE hidotpay_test;`，再從 Connect 介面取得該資料庫的專用連線字串。測試帳號的權限必須只限於這個測試資料庫。
