# NocoBase 財務後台（只讀）

NocoBase 是財務人員的檢視面板，不是帳本、簽名器或公開 API。它有自己的 PostgreSQL；不可共用 CockroachDB 帳本帳號，也不可取得簽名服務或 OpenBao 的權限。

## 本機啟動

1. 密鑰只放本機鑰匙圈，不要寫進 Git。開發機使用：
   - `hidotpay-nocobase-development-app-key` → `HIDOTPAY_NOCOBASE_APP_KEY`
   - `hidotpay-nocobase-development-db-password` → `HIDOTPAY_NOCOBASE_DB_PASSWORD`
   - 管理者密碼：`hidotpay-nocobase-development-admin-password`
2. 執行：

   ```sh
   export HIDOTPAY_NOCOBASE_APP_KEY="$(security find-generic-password -w -s hidotpay-nocobase-development-app-key)"
   export HIDOTPAY_NOCOBASE_DB_PASSWORD="$(security find-generic-password -w -s hidotpay-nocobase-development-db-password)"
   docker compose -f deployment/nocobase/docker-compose.development.yaml up -d
   ```

3. 在瀏覽器開啟 `http://127.0.0.1:13000`，第一次依畫面建立管理者帳號；密碼只能保存在本機系統鑰匙圈或正式密鑰服務。這是私有開發後台，不是公網財務系統。

## 接入金融資料的安全步驟

1. 先套用 Cockroach migration `012_admin_read_views.sql`。
2. 由資料庫管理員在私有環境建立 `hidotpay_nocobase_reader`，密碼只存放於雲端密鑰服務；再只授予 `finance-reader-grants.sql` 所列的檢視表讀取權。
3. NocoBase Community Edition 不含外接 PostgreSQL 資料來源模組，因此不得把 CockroachDB 連線帳密填入後台。使用獨立投影工作者讀取 `admin_*` 檢視表，並把可重建的查詢資料寫入 NocoBase 自己的 PostgreSQL。
4. 在 NocoBase 建立「財務檢視者」角色：只能看地址、充值、提幣、P2P 訂單／爭議、帳本流水和風控決策；不得建立資料來源、執行自訂動作、管理外掛或修改資料。

投影工作者使用獨立 `hidotpay_admin_read_model_writer` 服務角色，僅能對六個 `hidotpay_admin_*` 可重建集合執行依來源編號更新／新增，不能讀取集合、列出使用者、管理外掛或建立新的 API 金鑰。它的 API 金鑰與 CockroachDB CA 檔都必須由密鑰服務注入；本機驗收可使用系統鑰匙圈，禁止寫入 Git。

上述可看的內容不包含任何簽名材料、金鑰版本或簽名器參照。提幣核准仍經由受 Logto 角色保護的 API，不能由 NocoBase 直接改資料庫狀態。

## 正式環境

- 將 NocoBase 放在私有網路，只透過公司 VPN/身分閘道開放給已授權財務人員。
- 將 APP_KEY、後台資料庫密碼、唯讀資料庫密碼交由雲端密鑰服務注入；不寫進 Compose、Git、NocoBase 頁面或日誌。
- 固定 NocoBase 映像版本並先在隔離環境升級／還原驗證，再進正式環境。
