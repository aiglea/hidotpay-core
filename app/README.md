# hidotpay 登入測試 App

這是一個只驗證「註冊、登入、顯示帳戶名稱、登出」的 Expo 測試 App。它沒有錢包、USDT、卡片、充值或提現功能，也沒有引入 Cake Wallet。

## 立即在網頁測試

在終端機依序執行：

```bash
cd app
npm install
npm run web
```

接著用瀏覽器開啟終端機顯示的網址（預設為 `http://localhost:3000`）。按下「登入或註冊」後，會前往 Logto 的託管頁面；可直接在該頁面建立帳戶或登入，完成後會回到 hidotpay 並顯示使用者名稱。

網頁目前使用既有的 Logto SPA App ID：`tlc4kgyfsukbz60exkmun`，端點為 `https://ngu7sy.logto.app`，回調網址為：

```text
http://localhost:3000/callback
```

這個回調網址已在 Logto 設定中。如要把網頁伺服器改成其他埠號，請先在 Logto 的 SPA 應用程式加入對應的 `/callback` 網址，例如 `http://localhost:5173/callback`；不要自行假設已經開通。

## 日後 Android APK

同一套頁面已預留 Android 路徑，但這次不產出 APK。日後安裝 Android 開發環境後，執行：

```bash
cd app
npm install
npm run android
```

Android 使用既有的 Logto Native App ID：`jmefg2ses94nuvrkrc07i`，回調網址為：

```text
hidotpay://callback
```

`app.config.ts` 已設定 `hidotpay` scheme，這個 Native 回調網址已在 Logto 設定中。Expo Go 的開發回調若需要使用，應以已允許的 `exp://127.0.0.1:8081`、`exp://localhost:8081/--/callback` 為準；若實際 Expo 顯示不同網址，先把它列入 Logto Native 允許回調清單再測試。

## 公開設定與安全

複製 `.env.example` 成 `.env` 可覆蓋公開設定；`.env` 已被 git 忽略。SPA App ID 是公開識別碼，不是密碼。此 App 不需要也不保存任何私密憑證。
