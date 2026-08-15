# Figma Wallet MVP UI Design

## 目標

把 QPay Figma 的行動錢包視覺與互動落地為 hidotpay 前台；第一期只交付已具備或可安全銜接的登入／註冊與 Ethereum、TRON 充值流程，不以假資料冒充資產或交易成功。

## 已選方案

採用「Figma 視覺元件 + Logto 安全驗證」：Expo 前台提供完整的 hidotpay 引導、登入入口、註冊入口、錢包首頁與充值介面；登入與註冊從頁面上的按鈕啟動標準 OIDC 授權碼流程。帳密與驗證碼只由 Logto 的自訂 Sign-in Experience 接收及驗證，前台和錢包 API 永不接觸密碼。

沒有採用「前端把帳密送至自建 API」：這會讓錢包前台承擔密碼保存、重設、MFA、撞庫防護和稽核責任，且不符合目前 Logto 的安全整合路徑。也沒有採用「只放一張 Figma 截圖」：畫面必須能輸入、按鈕可點、能呈現載入、空白和錯誤狀態。

## Figma 來源與範圍

檔案 `KwXwdMAsvu6ZRpvNXm7WCR`，以 375×812 行動版為基準。已讀取的基準節點：

- `1019:16257` Splash Screen、`1019:16230` Onboarding - 1、`1019:16139` Onboarding - 2。
- `1019:16022` Login - Empty、`1019:15964` Login - Filled、`1019:15897` Sign up - Empty、`1019:15835` Sign up - Filled。
- `1019:14789` Home - V1、`1019:14133` Top Up、`1019:14033` Top Up Confirmation、`1019:12924` Transactions。

第一期不實作提款、卡片、P2P、KYC、洞察、推薦與通知的實際業務流程。若設計稿內有這些入口，會隱藏或標記為尚未開放，不能送出任何資金請求。

## 使用者流程

1. 未登入者依序看到 Splash／兩張引導頁，可略過或進到登入／註冊選擇。
2. 登入與註冊頁沿用 Figma 的欄位、層級與底部切換，但提交時啟動 Logto OIDC；註冊按鈕以 `firstScreen=register` 導向 Logto 的註冊體驗。頁面不蒐集或轉送密碼。
3. 成功回調後進入首頁，僅顯示 API 真實餘額；API 未配置、載入失敗或沒有資產時顯示對應提示，絕不顯示範例金額。
4. 使用者點「充值」後選擇 Ethereum 或 TRON，再取得該使用者、該網路的地址。地址畫面顯示網路名稱、可複製地址、風險提示與已選資產；只有 API 成功回傳才顯示地址。
5. 交易紀錄只顯示已驗證 API 回傳資料；空白、載入、錯誤與重試都有獨立視覺狀態。

## 架構與檔案責任

- `app/src/FigmaWalletTheme.ts`：統一色彩、間距、字級、圓角與 Figma 資產引用，不放 API 邏輯。
- `app/src/OnboardingFlow.tsx`：Splash、引導與登入／註冊入口狀態機。
- `app/src/LoginShell.tsx`：未登入容器與 OIDC 入口；維持 Web、Native 共用介面。
- `app/src/WalletHome.tsx`：已登入首頁、充值選擇、地址確認與交易紀錄；只呼叫既有 `wallet-api.ts`。
- `app/app/index.web.tsx`、`app/app/index.native.tsx`：以安全 OIDC 參數區分登入與註冊入口，保留既有 callback／logout 行為。
- `app/tests/*.test.mjs`：流程、真實資料防線、網路選項、已登入／未登入畫面合約與響應式回歸。
- `app/assets/figma/`：從 Figma 原始節點下載的視覺資產，連同來源節點清單提交；不依賴七天後失效的資產 URL。

## 驗收條件

- 375px、390px、768px、1440px 寬度無水平溢出；短螢幕內容可垂直捲動。
- 深／淺對比清楚、無產品介面 emoji、所有按鈕有焦點、按下與停用狀態；支援減少動態效果。
- 登入／註冊流程不得把密碼、私鑰、助記詞、API token 或 API URL 寫入靜態前端資產。
- 充值僅支援已明示的 Ethereum、TRON，未取得地址前不顯示地址；所有錯誤可重試。
- `npm test --prefix app`、`npm run typecheck --prefix app`、Web export 與實際 Cloudflare 靜態網址檢查通過。

## 不可宣稱的事項

此 UI 交付不等於資金服務上線。正式資金啟用仍須完成獨立資料庫、簽名隔離、多鏈掃描重組防護、API 原生路由、備份復原與雙人驗收。
