# HiDot Pay Cloudflare 受控部署設計

**日期：** 2026-08-15
**狀態：** 待使用者審閱
**範圍：** 第一階段錢包與帳本服務的 Cloudflare 對外入口與按需執行環境；不啟用主網提現。

## 目標

在不使用 AWS、也不自購常駐伺服器的前提下，將 HiDot Pay 的公開流量放在 Cloudflare，保留既有 CockroachDB、Blnk、Logto 與不可變帳本規則。系統必須可水平擴展，並保證一般 Worker、App 與 NocoBase 都不能讀到錢包私鑰。

## 已否決的方案

1. **把錢包私鑰放進 Workers Secret、Secrets Store 或 Container 環境變數：否決。** 這些是秘密傳遞服務；執行中的 Worker 或 Container 仍可讀取內容，不能作為不可匯出的資產簽名硬體。
2. **把既有 Fastify 加 PostgreSQL 驅動直接放進 Worker：否決。** 本專案已以 Workers runtime 實測，依賴會在 workerd 載入階段因 Node 網路內建模組失敗；不能靠未驗證的相容層上線。
3. **以全域 Cloudflare API Key 作部署憑證：否決。** 全域金鑰權限過大，且一旦出現在對話、終端或日誌就必須撤銷。

## 採用架構

```text
使用者 App / 網頁
        |
        v
Cloudflare Worker
  - Logto JWT 前置驗證
  - 限流、WAF、請求 ID、公開路由
  - 不含任何私鑰
        |
        v
Cloudflare Container（私有帳本 API）
  - Fastify ledger-api
  - Hyperdrive / 私有資料庫連線
  - Blnk、Redpanda、Temporal 的受限服務憑證
        |
        +--> CockroachDB / Blnk
        |
        +--> 獨立 signer（mTLS） --> 可稽核 secp256k1 HSM 或簽名器 --> 鏈上 RPC
```

### 元件責任

| 元件 | 可以做 | 絕對不能做 |
| --- | --- | --- |
| Cloudflare Worker | 驗證登入、限流、呼叫私有帳本 API、回傳公開資料 | 讀取或產生私鑰、任意交易簽名、直接修改帳本資料庫 |
| Cloudflare Container | 執行既有 Fastify 帳本 API、處理受控資料庫連線 | 保存私鑰、略過風控或雙人審批 |
| signer | 依核准的結構化請求衍生地址與簽名 | 對 App、Worker、NocoBase 或一般 API 開放 |
| NocoBase | 顯示 `admin_*` 唯讀檢視表與財務營運資料 | 直寫帳本、取得 signer 或金鑰資料 |

## 秘密與權限

1. 建立一枚新的 Cloudflare **API Token**，僅限 HiDot Pay 帳號與 Worker／Container／Secret Store 所需權限；不得使用 Global API Key。
2. Cloudflare Secret Store 僅保存資料庫連線、Logto、Blnk、工作程式與 mTLS 的服務憑證；所有值都以 Worker／Container 需要的最小範圍綁定。
3. `SIGNER_SERVICE_TOKEN` 只允許 ledger API 與 withdrawal worker 使用，並由私有網路和 mTLS 再次限制。
4. `WITHDRAWALS_ENABLED=false` 是所有 Cloudflare 環境的預設，直至實體 signer、測試網全流程、雙人覆核及上線驗收都完成。

## 首次部署範圍

1. 建立 `hidotpay-edge-api` Worker：只提供 `/healthz` 與已驗證的反向代理骨架。
2. 建立 Cloudflare Container 映像與私有服務設定，承載現有 `ledger-api`，不配置主網出金。
3. 由 Hyperdrive 或 Cloudflare 私有連線將 Container 接到 CockroachDB；資料庫帳號僅允許服務所需權限。
4. 建立 staging 環境，先驗證 Logto、帳本讀取、地址配置與站內轉帳；外部提現維持拒絕。
5. 僅在 staging 連續通過回歸、資料庫整合、容器健康檢查與帳本對帳後，才提出 production 部署申請。

## 驗收

- Worker、Container 與 Git 搜尋不到私鑰、助記詞、seed 或 Global API Key。
- 未帶有效 Logto token 的資金路由會被拒絕。
- Container 重新啟動後，地址與帳本餘額仍由 CockroachDB 取得且不變。
- 站內轉帳保持雙式平衡、冪等且不呼叫 signer。
- 任意外部提現都在建立凍結分錄前被 `WITHDRAWALS_ENABLED=false` 拒絕。
- Cloudflare 角色、Secret Store 綁定與部署 Token 均可追溯，且沒有全域管理權限。

## 非本次完成條件

主網 EVM／TRON 提現仍需要：可稽核的 secp256k1 HSM 或等效隔離 signer、測試網簽名到確認的完整演練、備份還原與故障演練、獨立安全審計、雙人覆核與合規批准。這些完成前，本方案只能作為受控開發／測試網基線。
