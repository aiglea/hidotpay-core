# Kubernetes 金融服務基線

`base/` 是帳本 API、deposit worker、outbox publisher、workflow dispatcher、reconciliation worker 與 P2P 付款逾時排程的部署基線：三副本、至少保留兩個可用副本、HPA、跨可用區分散、非 root、唯讀檔案系統、關閉 service account token，並以預設拒絕所有網路流量開始。背景服務都有不公開的 `/health/live` 與 `/health/ready` 探針；deposit worker 只會在成功掃過已啟用的資料庫地址與官方資產後標為可用。

部署前必須先完成：

1. 把 `services/ledger-api/Dockerfile`、`services/deposit-worker/Dockerfile`、`services/outbox-publisher/Dockerfile`、`services/workflows/Dockerfile` 和 `services/reconciliation-worker/Dockerfile` 建置並推送到你的私有 registry；再將 manifest 的 image 改為其不可變 digest。
2. 由密鑰服務建立 `hidotpay-ledger-api` Secret，僅注入 `DATABASE_URL`、`LOGTO_AUDIENCE`、`LOGTO_ISSUER`、`WITHDRAWAL_FEE_SCHEDULE`、`SIGNER_DERIVATION_URL`、`SIGNER_SERVICE_TOKEN`。後兩者只可連到私有 signer，且 signer 僅能回傳公開地址；manifest 會強制 `WITHDRAWALS_ENABLED=false`，因此 Secret 不能意外開啟提現。
3. 由密鑰服務建立 `hidotpay-outbox-publisher` Secret，僅注入 `DATABASE_URL`、`KAFKA_BROKERS`、`KAFKA_TOPIC`、`OUTBOX_BATCH_SIZE`、`OUTBOX_POLL_INTERVAL_MS`。Pod 名稱會提供唯一的 `OUTBOX_PUBLISHER_ID`；此服務只可連 CockroachDB 與 Redpanda，不可取得簽名器、Blnk 或使用者 API 密鑰。
4. 由密鑰服務建立 `hidotpay-deposit-worker` Secret，僅注入 `DATABASE_URL`、`DEPOSIT_LEDGER_URL`、`DEPOSIT_LEDGER_BEARER_TOKEN`、`DEPOSIT_EVM_NETWORKS`、`DEPOSIT_TRON_NETWORKS`、`DEPOSIT_POLL_INTERVAL_MS`、`DEPOSIT_MAX_BLOCK_RANGE`、`DEPOSIT_REORG_WINDOW`。TRON 設定必須包含私有 HTTPS 端點、最小權限 API key 與創世區塊雜湊；token 只具有 Logto `chain_worker` 角色；不得放入私鑰、助記詞或 signer 憑證。
5. 由密鑰服務建立 `hidotpay-workflow-dispatcher` Secret，僅注入 `KAFKA_BROKERS`、`KAFKA_TOPIC`、`WORKFLOW_CONSUMER_GROUP`、`TEMPORAL_ADDRESS`、`TEMPORAL_NAMESPACE`、`TEMPORAL_TASK_QUEUE`。
5. 為 Redpanda、Temporal、CockroachDB 所在 namespace 加上 `hidotpay.io/plane: infrastructure` 標籤；另為 Cloudflare Tunnel／Ingress 所在 namespace 加上 `hidotpay.io/plane: edge`。公開 API 只接受 edge namespace 進站，僅能對基礎設施與 Logto JWKS 的 HTTPS 出站。
6. 由密鑰服務建立 `hidotpay-reconciliation-worker` Secret，僅注入 `DATABASE_URL`、`BLNK_URL`、`BLNK_KEY`、`TEMPORAL_ADDRESS`、`TEMPORAL_NAMESPACE`、`RECONCILIATION_TEMPORAL_TASK_QUEUE`。reconciliation worker 會由 Pod 名稱取得唯一租約身分；公開 API、NocoBase 和瀏覽器不可加入此 Secret。
7. 由密鑰服務建立 `hidotpay-p2p-payment-expiry` Secret，僅注入最小權限 `DATABASE_URL` 和 `P2P_EXPIRY_BATCH_SIZE`。此 CronJob 每分鐘執行一次且禁止重疊，僅能連 CockroachDB；不可加入 Logto、Blnk、簽名器或瀏覽器憑證。
8. 在三個可用區建立 node group，確認節點具有 `topology.kubernetes.io/zone`；manifest 已要求同一服務跨區分散。設定監控與告警後才可實際套用。
9. 由密鑰服務建立 `hidotpay-admin-read-model-worker` Secret，僅注入 `ADMIN_READ_MODEL_SOURCE_DATABASE_URL`、`NOCOBASE_URL`、`NOCOBASE_API_TOKEN`；另建立 `hidotpay-admin-read-model-worker-ca` Secret，僅含 CockroachDB CA 檔 `root.crt`，以唯讀方式掛載在 `/var/run/hidotpay/cockroach-ca`。正式連線字串必須使用該容器路徑，且 `NOCOBASE_URL` 必須是私有 HTTPS 位址；不可加入帳本寫入帳號、NocoBase 管理者密碼、私鑰或簽名器憑證。

本目錄不含雲端憑證、私鑰或資料庫密碼。執行 `sh deployment/kubernetes/smoke-test.sh` 可驗證 manifest 結構與敏感字串防線。
