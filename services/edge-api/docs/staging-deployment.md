# Cloudflare staging 部署與回滾

這份文件只處理 **受控 staging**。它不是主網資金上線許可，也不會產生、保存或轉移錢包私鑰。

## 1. 上線前的硬性條件

1. 使用 macOS Keychain 的 `hidotpay-cloudflare-deployment-token`。不得再使用 Cloudflare Global API Key。
2. 建立專用 CockroachDB runtime 帳號，並只授與 ledger API 所需的資料表與序列權限；**不得使用管理員資料庫帳號**。
3. 已有隔離的測試網 signer derivation endpoint。不得把主網 signer 或任何私鑰接進 Cloudflare。
4. 先把 CockroachDB、Blnk、Logto、OpenBao Transit 與 signer 的完整主機名逐一放進 `ALLOWED_EGRESS_HOSTS`；未完成前維持預設 `blocked.invalid`，讓 Container 不能出站。
5. 本機要有可用的 Docker engine，才可讓 Wrangler 建置 Container 映像。

## 2. 設定非秘密值

在提交過程中，把 `services/edge-api/wrangler.jsonc` 的 `ALLOWED_EGRESS_HOSTS` 換成以逗號分隔的精確主機名，不可使用 `*`。此變更必須與審核紀錄一併提交。

若要讓網頁錢包呼叫 `/v1/`，同一份經審核設定還必須加入 `CORS_ALLOWED_ORIGINS`，值為以逗號分隔的完整網域，例如 `https://wallet.hidotpay.example`；不可使用 `*`，也不可填入路徑、萬用子網域或不受控網域。本機測試才可額外列出 `http://localhost:3000`。未列在白名單內的瀏覽器來源、預檢方法或請求標頭一律得到 `403`，不會喚起帳本 runtime。

`WITHDRAWALS_ENABLED=false` 必須保留在設定檔，且不可在 Cloudflare Dashboard 臨時改成 true。這個開關只允許在完整 HSM、測試網與雙人覆核驗收後，透過程式碼審核調整。

`LEDGER_API_ENABLED=false` 是 staging 的容器保護開關。所有 Secret、精確出站主機名、Container 映像與登入後健康檢查完成前，必須維持 `false`；登入請求會立即得到 `503`，不會啟動容器。只能與已審核的設定檔一起改為 `true`。

Staging 的 `max_instances` 固定為 `1`，避免在 API 尚未開啟時預留多個 1GiB 容器造成成本。正式環境的擴展數量必須根據壓測、風控與可用區設計另行設定，不能直接複製 staging 值。

## 3.1 CockroachDB 連線架構門檻

受控 Container 採取 `enableInternet=false` 加上 HTTPS 攔截與精確主機白名單。這個模式只容許 HTTP、HTTPS 與 DNS；CockroachDB Cloud 的 PostgreSQL SQL 連線使用 `26257`，不能在此模式直接使用 `DATABASE_URL`。

因此，在完成一個經審核的私有資料庫連線方案前（例如將 ledger API 移至具私有網路的受控執行環境，或使用經審核的資料庫存取服務），`LEDGER_API_ENABLED` 必須保持 `false`。**不得為了直連資料庫改回 enableInternet=true**，也不得把資料庫 URL 或帳號密碼公開化。

2026-08-15 已建立 `hidotpay-ledger-staging` Hyperdrive 設定，並以獨立、唯讀的 `SELECT 1` 成功驗證它可安全連到 CockroachDB。現有 Fastify API 不相容於 Workers 請求生命週期，不能直接搬入 Worker；後續只能以經審核的 Fetch 原生路由層承接，或維持 Node API 在私有執行環境。驗證用 Worker 已刪除，不保留公開資料庫探針。

## 4. 寫入 staging Secret

以下命令以互動方式輸入，輸入值不會出現在 shell history、Git 或本文件：

```bash
export CLOUDFLARE_API_TOKEN="$(security find-generic-password -s hidotpay-cloudflare-deployment-token -w)"
cd /Volumes/SING_02/.codex-worktrees/hidotpay-financial-core/services/edge-api
npx --no-install wrangler secret put DATABASE_URL
npx --no-install wrangler secret put BLNK_BASE_URL
npx --no-install wrangler secret put LOGTO_AUDIENCE
npx --no-install wrangler secret put LOGTO_ISSUER
npx --no-install wrangler secret put OPENBAO_TRANSIT_URL
npx --no-install wrangler secret put OPENBAO_TRANSIT_TOKEN
npx --no-install wrangler secret put SIGNER_DERIVATION_URL
npx --no-install wrangler secret put SIGNER_SERVICE_TOKEN
npx --no-install wrangler secret put WITHDRAWAL_FEE_SCHEDULE
```

不得放入私鑰、助記詞、seed、主網簽名 API 或任何可直接簽出資產的憑證。Cloudflare Secret 僅能用於資料庫與服務間連線；真正簽名保留在外部隔離 signer/HSM。

## 5. 部署與可觀察驗收

```bash
npx --no-install wrangler whoami
docker info --format '{{.ServerVersion}}'
npx --no-install wrangler deploy
```

部署成功後，只先驗證不會喚起 Container 的公開 edge 健康檢查：

```bash
curl --fail --silent --show-error https://hidotpay-edge-api-staging.<workers-subdomain>.workers.dev/healthz
curl --include https://hidotpay-edge-api-staging.<workers-subdomain>.workers.dev/not-a-route
curl --include https://hidotpay-edge-api-staging.<workers-subdomain>.workers.dev/v1/internal-transfers
```

驗收預期是：健康檢查回 `200`、未知路由回 `404`，未登入的資金路由回 `401` 或 `403`。任何 `5xx`、可讀到資金資料、或提現被接受，都視為失敗並立即停止。

## 6. 回滾

先列出版本，再將流量退回上一個已驗證版本：

```bash
npx --no-install wrangler versions list
npx --no-install wrangler rollback
```

回滾後重跑第 5 節三個 curl。若 database、signer 或 egress 設定有疑慮，先以 Cloudflare Dashboard 停用 Worker 流量並撤銷對應服務憑證；不可透過刪除帳本資料或直接修改帳本餘額來「修復」問題。
