# hidotpay 錢包 App

這是 hidotpay 的 Expo 使用者端基礎。登入後會進入錢包首頁；只有在「公開 API 網址」及「Logto API 權限」都已完成設定時，才會讀取真實帳本餘額、取得獨立充值地址及提交站內轉帳。

沒有設定受保護 API 時，App 會顯示「錢包服務尚未啟用」。這是刻意的保護措施：不顯示假餘額、不偽造成功轉帳，也不開啟提現。

## 公開預覽

目前線上是最新分支匯出的錢包，不是舊的引導頁：

```text
https://hidotpay-wallet-ui.lgninhk.workers.dev
```

這個 Worker 只提供 App 匯出的靜態畫面，沒有資料庫、API 密鑰、登入權杖或私鑰。登入後可看到餘額、充值、站內轉帳與交易紀錄畫面；沒有受保護 API 時不會顯示假餘額，也不會假裝轉帳成功。外部提現維持關閉。`codex/**` 分支推送後，GitHub Actions 會自動重新部署此頁。

## 立即在網頁測試

在終端機依序執行：

```bash
cd app
npm install
npm run web
```

接著用瀏覽器開啟終端機顯示的網址（預設為 `http://localhost:3000`）。按下「登入或註冊」後，會前往 Logto 的託管頁面；可直接在該頁面建立帳戶或登入，完成後會回到 hidotpay 錢包首頁。

網頁目前使用既有的 Logto SPA App ID：`tlc4kgyfsukbz60exkmun`，端點為 `https://ngu7sy.logto.app`，回調網址為：

```text
http://localhost:3000/callback
```

這個登入回調網址已在 Logto 設定中。如要把網頁伺服器改成其他埠號，請先在 Logto 的 SPA 應用程式加入對應的 `/callback` 網址，例如 `http://localhost:5173/callback`；不要自行假設已經開通。

正式公開預覽的登入回調網址是 `https://hidotpay-wallet-ui.lgninhk.workers.dev/callback`。在 Logto 的 SPA 應用程式新增此網址、同網域的登出回跳網址與 CORS 網域前，公開網址只可驗證畫面與 callback 路由，不可宣稱已完成端到端登入。

## 啟用受保護錢包資料（目前不可跳過）

在 `app/.env` 填入下列兩個**公開識別值**；它們不是密碼，也不能填入資料庫連線字串或任何私鑰：

```text
EXPO_PUBLIC_LEDGER_API_BASE_URL=https://你的受保護 API 網址
EXPO_PUBLIC_LEDGER_API_RESOURCE=https://你在 Logto 建立的 API Resource identifier
```

兩個值必須同時完成，流程才會真的讀取帳本：

1. 在 Logto 建立 API Resource，identifier 與 `LOGTO_AUDIENCE` 完全一致。
2. 在 Web、Android App 的 Logto 設定內允許這個 Resource。
3. 在私有／受控環境部署 API，驗證 issuer、audience 和使用者權杖。
4. Web API 入口必須設定 `CORS_ALLOWED_ORIGINS=https://你的錢包網域`；只填完全一致的網域，不可使用 `*`，本機開發才額外填 `http://localhost:3000`。
5. 保持 `LEDGER_API_ENABLED=false` 與 `WITHDRAWALS_ENABLED=false`，直到正式簽名器、備份還原、權限與雙人覆核完成。

目前 Logto 方案尚未提供 API Resource 額度，因此不能把這兩個值指向假網址來宣稱可用；詳情見 `docs/operations/logto-api-resource.md`。App 也會拒絕 HTTP API，避免把登入憑證送到不安全連線。

另外，為了讓「登出」後能自動回到 App 首頁，Logto SPA 應用程式的 **Post sign-out redirect URIs** 也必須加入：

```text
http://localhost:3000
```

這是和登入回調不同的設定欄位；沒有加入時，Logto 會拒絕登出並顯示 `post_logout_redirect_uri not registered`。

## 日後 Android APK

同一套錢包頁面已預留 Android 路徑，但這次不產出 APK。日後安裝 Android 開發環境後，執行：

```bash
cd app
npm install
npm run android
```

Android 使用既有的 Logto Native App ID：`jmefg2ses94nuvrkrc07i`，回調網址為：

```text
hidotpay://callback
```

`app.config.js` 已設定 `hidotpay` scheme，這個 Native 回調網址已在 Logto 設定中。Expo Go 的開發回調若需要使用，應以已允許的 `exp://127.0.0.1:8081`、`exp://localhost:8081/--/callback` 為準；若實際 Expo 顯示不同網址，先把它列入 Logto Native 允許回調清單再測試。

## 公開設定與安全

複製 `.env.example` 成 `.env` 可覆蓋公開設定；`.env` 已被 git 忽略。SPA App ID 是公開識別碼，不是密碼。此 App 不需要也不保存任何私密憑證。
