# NocoBase 財務後台（只讀）

NocoBase 是財務人員的檢視面板，不是帳本、簽名器或公開 API。它有自己的 PostgreSQL；不可共用 CockroachDB 帳本帳號，也不可取得簽名服務或 OpenBao 的權限。

## 本機啟動

1. 複製 `.env.example` 成本機私有環境變數檔，將兩個值換成不同的長隨機字串。不要把這個檔案提交到 Git。
2. 執行：

   ```sh
   set -a
   . deployment/nocobase/.env
   set +a
   docker compose -f deployment/nocobase/docker-compose.development.yaml up -d
   ```

3. 在瀏覽器開啟 `http://127.0.0.1:13000`，第一次依畫面建立管理者帳號；密碼只能保存在本機系統鑰匙圈或正式密鑰服務。

## 接入金融資料的安全步驟

1. 先套用 Cockroach migration `012_admin_read_views.sql`。
2. 由資料庫管理員在私有環境建立 `hidotpay_nocobase_reader`，密碼只存放於雲端密鑰服務；再只授予 `finance-reader-grants.sql` 所列的檢視表讀取權。
3. NocoBase Community Edition 不含外接 PostgreSQL 資料來源模組，因此不得把 CockroachDB 連線帳密填入後台。使用獨立投影工作者讀取 `admin_*` 檢視表，並把可重建的查詢資料寫入 NocoBase 自己的 PostgreSQL。
4. 在 NocoBase 建立「財務檢視者」角色：只能看地址、充值、提幣、P2P 訂單／爭議、帳本流水和風控決策；不得建立資料來源、執行自訂動作、管理外掛或修改資料。

上述可看的內容不包含任何簽名材料、金鑰版本或簽名器參照。提幣核准仍經由受 Logto 角色保護的 API，不能由 NocoBase 直接改資料庫狀態。

## 正式環境

- 將 NocoBase 放在私有網路，只透過公司 VPN/身分閘道開放給已授權財務人員。
- 將 APP_KEY、後台資料庫密碼、唯讀資料庫密碼交由雲端密鑰服務注入；不寫進 Compose、Git、NocoBase 頁面或日誌。
- 固定 NocoBase 映像版本並先在隔離環境升級／還原驗證，再進正式環境。
