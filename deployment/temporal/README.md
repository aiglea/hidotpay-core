# Temporal 工作流（開發環境）

這個目錄只提供本機開發用的單節點 Temporal。它把 Temporal 的資料放在**獨立 PostgreSQL**，不共用 CockroachDB 的金融帳本資料庫，也不包含任何私鑰、助記詞或簽名權限。

## 啟動

```sh
docker compose -f deployment/temporal/docker-compose.development.yaml up -d
```

- Temporal gRPC（僅本機）：`127.0.0.1:17233`
- Temporal UI（僅本機）：`http://127.0.0.1:18080`

停止時使用 `docker compose ... down`；若要移除本機流程資料，才額外執行 `down -v`。

## 正式環境的硬性規則

1. 不可使用本 compose，也不可使用 `auto-setup` 作為正式部署方式。
2. 使用 Temporal Cloud 或官方 Helm Chart，以多可用區 Temporal 服務與獨立、高可用 PostgreSQL/Cassandra 持久化層部署。
3. 只允許私有 worker 連線到 Temporal；公開 API、前端、NocoBase 均不得持有 Temporal 管理憑證。
4. worker 對每個來源使用固定 workflow ID。掃描到已最終確認、但尚未入帳的充值才可使用 `deposit:<deposit-id>`；`deposit.credited` outbox 事件只可使用 `reconciliation:<ledger-transaction-id>` 對帳，絕不可再入帳。提現使用 `withdrawal:<withdrawal-id>`。執行中的重複事件只取得原 workflow，不可另開一筆；已結束的 ID 拒絕重用。
5. 提幣一旦已有鏈上交易雜湊，不可自動釋放凍結資金；未確認或異常一律轉人工覆核。

官方 TypeScript 測試工具會下載獨立測試伺服器，因此 `services/workflows` 的測試不依賴 Docker，也已覆蓋 Activity 暫時失敗後的重試。
