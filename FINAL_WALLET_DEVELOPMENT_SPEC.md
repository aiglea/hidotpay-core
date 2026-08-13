# Universal Multi-Chain Wallet V1
## 生產版・最小自研・最大化 GitHub 開源復用・Flutter 完整開發規格

> **文件狀態：FINAL / 開發唯一基線**  
> **版本：3.0**  
> **日期：2026-08-12**  
> **目標平台：Android / iOS**  
> **產品形態：非託管、多鏈、手機熱錢包**  
> **核心原則：盡量不重寫錢包底層，只做品牌、UI、安全加固、供應商配置和必要修復**

---

# 目錄

1. [最終決策](#1-最終決策)
2. [「全部鏈」的精確定義](#2-全部鏈的精確定義)
3. [上游選型與授權門檻](#3-上游選型與授權門檻)
4. [產品宗旨](#4-產品宗旨)
5. [第一版範圍](#5-第一版範圍)
6. [最小自研原則](#6-最小自研原則)
7. [總體架構](#7-總體架構)
8. [上游代碼鎖定策略](#8-上游代碼鎖定策略)
9. [倉庫結構](#9-倉庫結構)
10. [錢包與助記詞規格](#10-錢包與助記詞規格)
11. [本地安全與密鑰保存](#11-本地安全與密鑰保存)
12. [鏈支持矩陣](#12-鏈支持矩陣)
13. [鏈適配原則](#13-鏈適配原則)
14. [RPC、Indexer 與供應商策略](#14-rpcindexer-與供應商策略)
15. [Token 與資產資料](#15-token-與資產資料)
16. [UI 重構規格](#16-ui-重構規格)
17. [完整頁面清單](#17-完整頁面清單)
18. [交易流程](#18-交易流程)
19. [無服務器邊界](#19-無服務器邊界)
20. [安全硬化](#20-安全硬化)
21. [日誌、分析與隱私](#21-日誌分析與隱私)
22. [開源合規](#22-開源合規)
23. [Git 與上游同步](#23-git-與上游同步)
24. [CI/CD](#24-cicd)
25. [測試策略](#25-測試策略)
26. [外部安全審計](#26-外部安全審計)
27. [開發階段](#27-開發階段)
28. [驗收標準](#28-驗收標準)
29. [主網發布門檻](#29-主網發布門檻)
30. [長期維護策略](#30-長期維護策略)
31. [已知限制與風險](#31-已知限制與風險)
32. [開發者啟動命令](#32-開發者啟動命令)
33. [配置文件範例](#33-配置文件範例)
34. [交付物清單](#34-交付物清單)
35. [授權申請郵件模板](#35-授權申請郵件模板)
36. [最終 Definition of Done](#36-最終-definition-of-done)

---

# 1. 最終決策

## 1.1 技術方向

本項目不再採用「全新 Flutter App + 從零封裝多鏈核心」的方案。

最終方向是：

```text
成熟的完整 Flutter 多鏈錢包上游
        ↓
固定 Commit 建立公司 Fork
        ↓
保留原有錢包核心、鏈模組、交易模型和測試
        ↓
只修改品牌、UI、流程、配置和安全加固
        ↓
完成全鏈回歸測試與外部安全審計
        ↓
發布生產版
```

## 1.2 主上游

**首選完整上游：**

```text
Repository: mrtnetwork/onchain_wallet
Pinned commit: b3fb70fc67647dd271f3aa7442520370d59861c9
Framework: Flutter / Dart
```

選擇原因：

- 是完整錢包 App，不只是簽名 SDK。
- 已經有建立、導入、收款、轉帳、節點、資產、Web3 等錢包流程。
- 已集成多個鏈家族，而不是只做 EVM。
- Android 與 iOS 共用 Flutter UI。
- 可以最大限度減少自研代碼。
- 上游依賴本身已覆蓋大量鏈上序列化、地址、簽名和交易能力。

## 1.3 非常重要的授權門檻

目前上游倉庫的 `LICENSE` 不是標準 Apache-2.0。

其中存在「不得修改」的額外文字，因此：

> **在取得作者書面商業修改、重新品牌及分發授權以前，不得將此 Fork 對外發布、上架、銷售或作為商用產品分發。**

允許開發團隊在私有環境進行：

- 技術評估
- 本地編譯
- 安全審計
- UI 原型
- 自動化測試

但在授權完成前，禁止：

- 對外測試分發
- TestFlight 外部測試
- Google Play 測試軌道公開分發
- 使用其代碼發布商業 APK/IPA
- 宣稱我們擁有修改與再分發權

## 1.4 自動回退方案

若在項目啟動後 **5 個工作日內** 無法取得明確書面授權，立即切換到：

```text
Fallback base: cake-tech/cake_wallet
License: MIT
Framework: Flutter
```

但必須明確：

- Cake Wallet 的鏈覆蓋少於首選上游。
- 回退後不能再承諾「只改 UI 就支持所有鏈」。
- 缺失的鏈必須另行接入和測試。
- 時間與開發量會增加。

## 1.5 不採用的方案

第一版禁止同時混用多套簽名引擎。

不採用：

```text
Cake Wallet signer
+ Trust Wallet Core signer
+ MRT Dart signer
+ 某些第三方 JS signer
```

最終產品必須保持：

```text
同一上游錢包架構
同一套 Seed 管理
同一套簽名入口
同一套交易模型
同一套本地安全策略
```

---

# 2. 「全部鏈」的精確定義

## 2.1 不得使用不真實的宣傳

不存在一個錢包能在沒有新增代碼、RPC、交易格式和測試的情況下，自動支持世界上每一條區塊鏈。

本文件中的「全部鏈」定義為：

> **第一版啟用並完整驗證所選上游在固定 Commit 中已實現的全部鏈家族；同時允許同家族網絡通過配置擴展，而不重寫 UI。**

## 2.2 第一版目標鏈家族

首選上游目前涵蓋的主要家族包括：

```text
1. Bitcoin 與 Bitcoin forks
2. Ethereum / EVM
3. TRON
4. XRP Ledger
5. Solana
6. Cardano
7. Cosmos / Evmos
8. TON
9. Stellar
10. Substrate / Polkadot
11. Monero
12. Zcash
13. Sui
14. Aptos
```

## 2.3 動態網絡含義

### EVM 家族

一套 EVM Adapter 可以支持：

- Ethereum
- BNB Chain
- Polygon
- Arbitrum
- Optimism
- Base
- Avalanche C-Chain
- Linea
- Scroll
- Blast
- zkSync Era
- 其他兼容 EVM 的網絡

但每個網絡仍然必須配置：

- Chain ID
- RPC
- Explorer
- Native Token
- Gas 規則
- Token List
- 最低版本
- 測試向量

### Cosmos 家族

可透過 Chain Registry / 配置增加兼容網絡，但仍需驗證：

- Bech32 Prefix
- Coin Type
- Denom
- Fee Token
- Amino / Protobuf
- Sign Mode
- IBC 能力
- RPC / LCD / gRPC

### Substrate 家族

可通過 metadata 配置增加兼容網絡，但仍需驗證：

- SS58 Prefix
- Runtime Metadata
- Signed Extensions
- Spec Version
- Transaction Version
- Native Token Decimals

## 2.4 第一版不承諾

第一版不承諾：

- 未被上游實現的全新鏈協議
- 未審計的自定義鏈
- 所有鏈上的所有 DeFi 功能
- 所有鏈上的 NFT
- 所有鏈上的 Staking
- 所有鏈上的任意智能合約調用
- 所有鏈上的跨鏈橋

---

# 3. 上游選型與授權門檻

## 3.1 直接使用的上游模組

首選上游的 Flutter 工程已經使用多個開源鏈庫。開發者應優先保留，不得無理由重寫：

```text
blockchain_utils
bitcoin_base
xrpl_dart
on_chain
cosmos_sdk
ton_dart
polkadot_dart
stellar_dart
monero_dart
zcash_dart
on_chain_swap
on_chain_bridge
```

## 3.2 每個依賴必須完成的檢查

在正式開發前，建立：

```text
docs/open-source/UPSTREAMS.lock.yaml
docs/open-source/THIRD_PARTY_NOTICES.md
docs/open-source/LICENSE_REVIEW.md
```

每個依賴記錄：

```yaml
name:
repository:
package:
version:
commit:
license:
license_file_sha256:
runtime_or_buildtime:
security_critical:
owner:
last_reviewed_at:
auto_upgrade: false
```

## 3.3 禁止浮動依賴

禁止：

```yaml
ref: main
ref: master
version: any
version: ^x.y.z   # 對安全關鍵庫不得使用自由浮動
```

必須：

- 固定 Git Commit。
- 固定 Package 版本。
- 提交 `pubspec.lock`。
- CI 驗證 Lockfile 未被意外更新。
- 升級只能由專門 PR 完成。

---

# 4. 產品宗旨

## 4.1 一句話

建立一個：

> **用戶自行掌握私鑰、支持多鏈、穩定幣優先、界面接近現代金融 App、第一版即可進入生產審計流程的手機熱錢包。**

## 4.2 產品原則

1. 私鑰只在設備本地生成和使用。
2. 公司不保存用戶助記詞。
3. 先復用成熟開源，再考慮自研。
4. 不重寫已有的密碼學和交易序列化。
5. UI 與鏈邏輯分離。
6. 所有鏈共用一致的資產、收款和轉帳體驗。
7. 網絡差異只由 Chain Adapter 處理。
8. 任何安全降級都必須經書面批准。
9. 未通過安全審計不得公開主網。
10. 不以「功能多」取代「安全和正確」。

---

# 5. 第一版範圍

## 5.1 必須完成

### 錢包

- 建立 24 詞錢包
- 導入 BIP39 助記詞
- 多錢包
- 多帳戶
- 顯示公開地址
- 收款 QR
- 轉帳
- 交易歷史
- 自訂節點
- 自訂 EVM 網絡
- 自訂 Token
- 地址簿
- 生物識別
- PIN
- 自動鎖定
- 備份驗證
- 錢包刪除

### 鏈

- 啟用固定上游 Commit 中已完整實現的全部鏈家族
- 每個鏈家族至少完成一筆測試網收款
- 每個鏈家族至少完成一筆測試網轉帳
- 每個鏈家族完成恢復一致性測試
- 每個鏈家族完成錯誤地址和錯誤網絡測試

### 產品

- 全新品牌
- 全新 Design System
- 繁體中文
- 簡體中文
- 英文
- 深色模式
- 無障礙基線
- 法幣估值
- Token 搜索
- 網絡搜索
- 交易狀態
- 失敗重試
- RPC 故障切換

## 5.2 第一版暫不開放

即使上游已有，也默認關閉：

- Swap
- Bridge
- DApp Browser
- 任意合約 Blind Signing
- NFT
- Staking
- WalletConnect
- Fiat On-ramp
- Fiat Off-ramp
- 卡片
- Nium
- Bridge.xyz
- KYC
- 雲端助記詞
- 社交恢復
- MPC

原因：

- 先縮小安全攻擊面。
- 先完成純錢包生產審計。
- 後續以獨立模組逐步開啟。

---

# 6. 最小自研原則

## 6.1 允許修改的部分

開發團隊主要修改：

```text
品牌名稱
Logo
App Icon
Splash
顏色
字體
排版
首頁
資產卡片
導航
Onboarding
備份流程 UX
轉帳確認 UX
文案
本地化
功能開關
RPC 配置
Token 配置
安全策略
日誌策略
CI/CD
測試
必要安全修復
```

## 6.2 原則上不修改的部分

除非發現明確漏洞或錯誤，原則上不修改：

```text
橢圓曲線算法
BIP39 實現
BIP32/BIP44 實現
地址編碼
鏈交易序列化
簽名算法
鏈 ABI 編碼
原始交易構建
Monero / Zcash 密碼學
Substrate Metadata 解析
TON Cell 編碼
Solana Message 編碼
```

## 6.3 代碼改動預算

目標：

```text
上游保留：85%–95%
自有修改：5%–15%
```

如自有修改超過 20%，必須召開架構審查，確認是否正在不必要地重寫上游。

## 6.4 Patch 原則

每個非 UI Patch 必須：

- 單獨 Commit
- 有 Issue
- 有測試
- 有原因
- 有回滾方法
- 優先提交給上游
- 在 `patches/README.md` 登記

---

# 7. 總體架構

```text
┌─────────────────────────────────────────────┐
│                Flutter App                  │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │ 自有 Design System / 品牌 UI          │  │
│  └───────────────────┬───────────────────┘  │
│                      │                      │
│  ┌───────────────────▼───────────────────┐  │
│  │ 上游 Wallet Application Layer         │  │
│  │ Wallet / Account / Asset / Transaction│  │
│  └───────────────────┬───────────────────┘  │
│                      │                      │
│  ┌───────────────────▼───────────────────┐  │
│  │ 上游 Chain Modules                    │  │
│  │ BTC / EVM / TRON / SOL / XRP / ...   │  │
│  └──────────────┬───────────────┬────────┘  │
│                 │               │           │
│  ┌──────────────▼───────┐ ┌────▼────────┐  │
│  │ Secure Local Storage │ │ RPC Adapter │  │
│  │ Keychain / Keystore  │ │ Multi RPC   │  │
│  └──────────────────────┘ └────┬────────┘  │
└─────────────────────────────────┼───────────┘
                                  │
                         HTTPS / RPC / WS
                                  │
                  ┌───────────────▼───────────────┐
                  │ Blockchain Nodes / Indexers   │
                  └───────────────────────────────┘
```

## 7.1 重要架構要求

- UI 不直接操作私鑰。
- UI 不直接拼裝原始交易。
- UI 只調用上游 Wallet / Chain Service。
- 私鑰不得傳到遠端服務器。
- RPC 僅接收公開地址與已簽名交易。
- 所有鏈差異由 Chain Module 處理。
- 不建立第二套平行錢包引擎。

---

# 8. 上游代碼鎖定策略

## 8.1 初始鎖定

```yaml
primary_upstream:
  repository: https://github.com/mrtnetwork/onchain_wallet
  commit: b3fb70fc67647dd271f3aa7442520370d59861c9
  branch: upstream-main
  integration: full-app-fork
  auto_upgrade: false
```

## 8.2 公司 Fork 分支

```text
upstream-main
company-main
release/v1.0
feature/*
security/*
hotfix/*
```

## 8.3 禁止

- 不得每天自動合併上游。
- 不得直接在 `company-main` 做實驗。
- 不得刪除上游 Git 歷史。
- 不得 squash 全部上游歷史。
- 不得把上游來源偽裝成完全自研。
- 不得移除法定 Attribution。

---

# 9. 倉庫結構

建議最終結構：

```text
wallet/
├── app/
│   ├── lib/
│   │   ├── app/
│   │   ├── design_system/
│   │   ├── features/
│   │   ├── localization/
│   │   ├── branding/
│   │   └── upstream/
│   ├── android/
│   ├── ios/
│   └── test/
│
├── assets/
│   ├── brand/
│   ├── tokens/
│   ├── networks/
│   └── fonts/
│
├── config/
│   ├── chains/
│   ├── rpc/
│   ├── tokens/
│   ├── explorers/
│   └── feature_flags/
│
├── docs/
│   ├── architecture/
│   ├── security/
│   ├── open-source/
│   ├── release/
│   └── testing/
│
├── patches/
│   ├── upstream/
│   └── README.md
│
├── scripts/
│   ├── verify_upstreams.dart
│   ├── generate_chain_registry.dart
│   ├── generate_token_manifest.dart
│   ├── verify_licenses.sh
│   └── build_release.sh
│
├── .github/
│   ├── workflows/
│   ├── ISSUE_TEMPLATE/
│   └── CODEOWNERS
│
├── pubspec.yaml
├── pubspec.lock
├── LICENSES/
├── THIRD_PARTY_NOTICES.md
├── SECURITY.md
└── README.md
```

---

# 10. 錢包與助記詞規格

## 10.1 新錢包

第一版默認：

```text
標準：BIP39
語言：English
單詞數：24
Entropy：256-bit
Passphrase：關閉
生成位置：設備本地
網絡：不需要
```

## 10.2 導入兼容性

允許導入：

- 12 詞
- 15 詞
- 18 詞
- 21 詞
- 24 詞

默認新建仍只生成 24 詞。

## 10.3 隨機數

必須使用：

- iOS：`SecRandomCopyBytes`
- Android：`SecureRandom` 並驗證來源
- Flutter：不得自行使用非密碼學 RNG

禁止：

- `Random()`
- 時間戳
- UUID 作為 Entropy
- 服務器返回的 Seed
- 分析 SDK 生成的 ID
- 測試固定值進入 Production

## 10.4 每個用戶獨立 Seed

禁止：

```text
公司 Master Seed
   ├── User 1
   ├── User 2
   └── User N
```

必須：

```text
User A Device → Seed A
User B Device → Seed B
User C Device → Seed C
```

## 10.5 派生路徑

派生路徑以各上游鏈模組的正式規格為準。

不得為了統一界面而強制所有鏈使用同一 Coin Type。

必須建立測試：

```text
同一助記詞
→ iOS 地址
→ Android 地址
→ 上游官方測試向量
三者必須一致
```

---

# 11. 本地安全與密鑰保存

## 11.1 存儲要求

助記詞、Seed、私鑰不得存入：

- SharedPreferences
- 普通 Hive
- 普通 SQLite
- Firebase
- Analytics
- Crash Report
- Clipboard
- Screenshot
- 普通日誌
- 文件下載目錄
- iCloud 普通文件
- Google Drive 普通文件

## 11.2 iOS

至少使用：

```text
Keychain
kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly
ThisDeviceOnly
BiometryCurrentSet / UserPresence
```

要求：

- 設備沒有系統密碼時禁止建立錢包。
- Face ID / Touch ID 變化後要求 PIN。
- 換機不能自動帶走不可導出的本地密鑰。
- App 進入背景立即遮罩敏感頁面。

## 11.3 Android

至少使用：

```text
Android Keystore
TEE-backed key
StrongBox 優先
setUserAuthenticationRequired(true)
```

要求：

- 偵測硬件安全級別。
- 純軟體 KeyStore 設備顯示高風險。
- 高風險設備可以禁止新建錢包，策略由安全團隊決定。
- Root 只作風險信號，不作唯一安全邊界。
- 禁止 Android Backup 備份錢包秘密。

## 11.4 PIN

建議：

```text
長度：8–12 位數字
錯誤 5 次：30 秒
錯誤 8 次：5 分鐘
錯誤 10 次：30 分鐘
錯誤 15 次：要求重新導入助記詞或安全清除
```

不得僅使用 PIN 作為直接 AES Key。

## 11.5 自動鎖定

默認：

- 進入背景：立即鎖定敏感操作
- 30 秒無操作：鎖定
- 重新打開 App：要求生物識別或 PIN
- 轉帳前：再次認證
- 導出助記詞前：再次認證
- 刪除錢包前：再次認證

---

# 12. 鏈支持矩陣

每個鏈家族都要在下表完成後才可標記為 Production Enabled。

| 鏈家族 | 建立地址 | 查餘額 | 收款 | 原生幣轉帳 | Token 轉帳 | 費用估算 | 歷史 | 恢復一致 | 主網灰度 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Bitcoin | 必須 | 必須 | 必須 | 必須 | N/A | 必須 | 必須 | 必須 | 必須 |
| EVM | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 |
| TRON | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 |
| XRP | 必須 | 必須 | 必須 | 必須 | 視功能 | 必須 | 必須 | 必須 | 必須 |
| Solana | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 |
| Cardano | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 |
| Cosmos | 必須 | 必須 | 必須 | 必須 | 視鏈 | 必須 | 必須 | 必須 | 必須 |
| TON | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 |
| Stellar | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 |
| Substrate | 必須 | 必須 | 必須 | 必須 | 視鏈 | 必須 | 必須 | 必須 | 必須 |
| Monero | 必須 | 必須 | 必須 | 必須 | N/A | 必須 | 必須 | 必須 | 必須 |
| Zcash | 必須 | 必須 | 必須 | 必須 | N/A | 必須 | 必須 | 必須 | 必須 |
| Sui | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 |
| Aptos | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 | 必須 |

## 12.1 啟用規則

任何一行未全部完成：

```text
enabled_in_production = false
```

不能因為上游 README 寫了支持，就直接在生產 UI 顯示。

---

# 13. 鏈適配原則

## 13.1 共用接口

UI 只依賴統一接口：

```dart
abstract interface class ChainService {
  Future<List<Account>> deriveAccounts(WalletRef wallet);
  Future<List<AssetBalance>> getBalances(Account account);
  Future<FeeQuote> estimateFee(UnsignedTransfer transfer);
  Future<SignedTransaction> signTransfer(UnsignedTransfer transfer);
  Future<BroadcastResult> broadcast(SignedTransaction transaction);
  Future<TransactionStatus> getTransactionStatus(String txId);
  bool validateAddress(String address);
}
```

實際方法名可以跟隨上游，但語義必須一致。

## 13.2 禁止 UI 判斷鏈細節

禁止在 Widget 中寫：

```dart
if (chain == "tron") { ... }
if (chain == "bitcoin") { ... }
```

應改成：

```dart
final capabilities = chain.capabilities;
```

由能力控制：

- 支持 Token
- 支持 Memo
- 支持 Tag
- 支持 Multi-output
- 支持 Fee Level
- 支持 Resource / Energy
- 支持 UTXO
- 支持 Staking
- 支持 Web3

---

# 14. RPC、Indexer 與供應商策略

## 14.1 無後端不等於無外部節點

錢包仍需：

- RPC
- WebSocket
- Explorer
- Indexer
- Price API
- Token Metadata

## 14.2 多供應商

每個主要鏈至少配置：

```text
Primary RPC
Secondary RPC
Emergency RPC
User Custom RPC
```

## 14.3 健康檢查

定期檢查：

- Chain ID
- Latest Block
- Latency
- Error Rate
- Sync Lag
- TLS
- Response Schema

## 14.4 API Key

任何放入 App 的 Key 都視為可被提取。

禁止放入：

- 管理員 Key
- 提款 Key
- 付款供應商 Secret
- HMAC Secret
- 私有 RPC Root Key
- 可修改項目的雲端憑證

## 14.5 生產建議

第一版可以沒有用戶後端，但建議使用：

```text
Static signed config
Object Storage
CDN
```

用於更新：

- RPC 優先級
- 故障節點
- Explorer
- Token Manifest
- 最低 App 版本
- 只讀模式
- 緊急公告

---

# 15. Token 與資產資料

## 15.1 Trust Wallet Assets 的使用方式

可把 `trustwallet/assets` 作為建置時資料來源，但禁止 App 運行時直接依賴 GitHub `master`。

流程：

```text
固定 Commit
    ↓
提取需要的 Network / Token
    ↓
驗證合約與 Decimals
    ↓
人工審核
    ↓
生成 token-manifest.json
    ↓
離線簽名
    ↓
App 驗證後載入
```

## 15.2 Token Manifest

每個 Token 至少包括：

```json
{
  "chain_id": "tron",
  "network": "mainnet",
  "name": "Tether USD",
  "symbol": "USDT",
  "contract": "<verified-contract>",
  "decimals": 6,
  "logo": "assets/tokens/...",
  "verified": true,
  "source_commit": "<commit>",
  "enabled": true
}
```

## 15.3 詐騙防護

- 同名 Token 顯示完整網絡。
- 未驗證 Token 顯示警告。
- 不允許 Token Logo 覆蓋系統 UI。
- 合約地址在詳情頁可見。
- 自訂 Token 不得默認標記為 Verified。

---

# 16. UI 重構規格

## 16.1 目標

UI 風格：

```text
現代金融 App
+ 穩定幣優先
+ 清晰
+ 少 Web3 術語
+ 不犧牲鏈信息
```

## 16.2 UI 只能改顯示，不可改簽名語義

例如可改：

- 按鈕樣式
- 動畫
- 首頁排版
- 資產卡片
- 導航
- 字體
- 顏色

不可因 UI 簡化而隱藏：

- 網絡
- Token 合約
- 收款地址
- Memo / Tag
- 交易費
- 最終到帳金額
- Gas Token
- 鏈 ID
- 危險授權
- 交易類型

## 16.3 Design Tokens

建立：

```dart
AppColors
AppTypography
AppSpacing
AppRadius
AppElevation
AppMotion
AppIconography
```

禁止在各頁面散落硬編碼顏色和尺寸。

## 16.4 首頁

首頁必須：

- 顯示總資產
- 支持隱藏餘額
- 顯示收款
- 顯示轉帳
- 顯示資產列表
- 每個 Token 明確顯示網絡
- 支持網絡篩選
- 支持 Token 搜索
- 支持自訂排序
- 顯示 RPC 異常狀態

---

# 17. 完整頁面清單

第一版至少包含：

1. Splash
2. 語言選擇
3. 歡迎頁
4. 建立錢包
5. 導入錢包
6. 設定 PIN
7. 生物識別
8. 24 詞助記詞展示
9. 助記詞驗證
10. 安全提醒
11. 首頁
12. 網絡篩選
13. 資產搜索
14. Token 詳情
15. 網絡詳情
16. 收款
17. QR 全屏
18. 轉帳地址輸入
19. 掃碼
20. 金額輸入
21. Memo / Tag
22. 費用選擇
23. 交易確認
24. 生物識別簽名
25. 廣播中
26. 交易成功
27. 交易失敗
28. 交易詳情
29. 活動記錄
30. 地址簿
31. 錢包列表
32. 帳戶列表
33. 新增帳戶
34. 自訂 Token
35. 自訂 EVM 網絡
36. RPC 節點
37. 安全設定
38. 自動鎖定
39. 備份助記詞
40. 導出公開地址
41. 刪除錢包
42. 關於
43. 開源授權
44. 隱私政策
45. 服務條款
46. 錯誤報告

---

# 18. 交易流程

```text
選擇資產
  ↓
輸入 / 掃描地址
  ↓
鏈地址校驗
  ↓
輸入金額
  ↓
檢查 Memo / Tag
  ↓
查餘額
  ↓
估算費用
  ↓
檢查 Gas Token
  ↓
顯示完整確認頁
  ↓
生物識別 / PIN
  ↓
本地簽名
  ↓
廣播
  ↓
Pending
  ↓
Confirmed / Failed
```

## 18.1 交易確認頁

必須顯示：

- From
- To
- 網絡
- Token
- 合約地址
- 金額
- 網絡費
- Gas Token
- Memo / Tag
- Nonce / Sequence（高級詳情）
- 預計到帳
- 風險警告

## 18.2 地址粘貼

- 清除頭尾空格。
- 禁止靜默修改中間字符。
- 顯示頭尾至少 6 個字符。
- 支持完整展開。
- 對錯誤網絡給出明確阻斷。
- 對地址簿替換、剪貼板替換攻擊做二次提示。

---

# 19. 無服務器邊界

## 19.1 第一版不需要

- 用戶帳號後端
- 密碼後端
- 私鑰服務器
- 簽名服務器
- 中央錢包
- 用戶資產資料庫
- 雲端助記詞

## 19.2 第一版仍會連接

- Blockchain RPC
- Indexer
- Explorer
- Price API
- Static Config CDN
- App Store / Play Store
- 可選 Crash 平台

## 19.3 後端永遠不得接收

- 助記詞
- Seed
- 私鑰
- PIN
- 解密密鑰
- 生物識別資料
- 未經用戶確認的簽名請求

---

# 20. 安全硬化

## 20.1 屏幕安全

- 助記詞頁禁止截圖。
- Android 使用 `FLAG_SECURE`。
- iOS 偵測錄屏並遮罩。
- App Switcher 顯示模糊畫面。
- 不允許助記詞複製。
- 不允許敏感頁面自動填充。

## 20.2 Root / Jailbreak

檢測：

- Root
- Magisk
- Frida
- Debugger
- Hooking
- Jailbreak
- 動態注入
- 模擬器
- Overlay

處理：

- 顯示高風險提示。
- 禁止導出助記詞。
- 可禁止新建錢包。
- 可禁止大額交易。
- 不把檢測當作唯一防線。

## 20.3 Debug

Production 必須：

- `kDebugMode == false`
- 關閉 Dev Menu
- 關閉 Mock RPC
- 關閉測試 Seed
- 關閉測試 Faucet
- 關閉詳細敏感錯誤
- 移除測試 API Key

## 20.4 交易簽名

- 不提供 Raw Sign 公開接口。
- 不提供任意消息 Blind Sign。
- V1 只允許經 UI 解析和展示的交易類型。
- 簽名對象必須和確認頁顯示內容同源。
- 確認後任何字段變化必須重新確認。

---

# 21. 日誌、分析與隱私

## 21.1 絕對禁止記錄

- 助記詞
- 私鑰
- Seed
- PIN
- 完整 Clipboard
- 完整原始簽名資料
- 解密後 Vault
- 生物識別資料

## 21.2 地址

錢包地址屬於敏感個人財務識別資料。

Analytics 中原則上不得記錄完整地址。

如必須排錯：

```text
HMAC(address, rotating-debug-key)
```

且：

- Debug Key 有效期短。
- 不可反查。
- 不與廣告 ID 關聯。
- 用戶明確同意。

## 21.3 Crash

Crash 上報前必須設置全局 Sanitizer。

Release 前執行：

```text
grep
static scan
runtime canary
```

確認秘密不會進入 Crash Payload。

---

# 22. 開源合規

## 22.1 必備文件

```text
LICENSES/
THIRD_PARTY_NOTICES.md
UPSTREAMS.lock.yaml
LICENSE_REVIEW.md
SOURCE_OFFER.md   # 如適用
```

## 22.2 商標

開源代碼授權不等於商標授權。

必須移除或替換：

- 上游 Logo
- 上游商標
- 上游 App 名稱
- 上游 Package ID
- 上游深鏈 Domain
- 上游網站
- 上游 Analytics
- 上游 Support Email

## 22.3 Attribution

保留：

- Copyright
- License
- NOTICE
- 必須的源碼聲明
- 第三方授權頁

## 22.4 法律審查 Gate

在首次外部分發前，法律或合規負責人必須簽署：

```text
OPEN_SOURCE_RELEASE_APPROVAL.md
```

---

# 23. Git 與上游同步

## 23.1 Remote

```bash
git remote -v

origin    git@github.com:<company>/<wallet>.git
upstream  https://github.com/mrtnetwork/onchain_wallet.git
```

## 23.2 更新節奏

- 安全漏洞：立即評估
- 普通上游更新：每月評估
- 大版本：季度升級窗口
- 不自動 Merge
- 不自動發布

## 23.3 Upstream Sync PR

每次上游同步必須包含：

- Base Commit
- Target Commit
- Commit Range
- License Change
- Dependency Change
- Chain Change
- Security Change
- Migration
- 回歸矩陣
- 回滾方案

---

# 24. CI/CD

最低 Workflow：

```text
1. pull-request.yml
2. android-release.yml
3. ios-release.yml
4. upstream-audit.yml
5. dependency-audit.yml
6. nightly-chain-tests.yml
```

## 24.1 PR CI

必須執行：

- `flutter analyze`
- `dart format --set-exit-if-changed`
- Unit Tests
- Widget Tests
- Golden Tests
- Secret Scan
- Dependency Audit
- License Audit
- Lockfile Check
- Forbidden API Scan

## 24.2 Android

- AAB
- APK
- Signing
- R8
- ProGuard Mapping
- SBOM
- SHA-256
- Provenance
- Play Integrity 配置
- Internal Track 自動上傳

## 24.3 iOS

- Archive
- IPA
- dSYM
- SBOM
- SHA-256
- Provenance
- TestFlight Internal 上傳
- Entitlements 審核
- Privacy Manifest 審核

## 24.4 發布權限

至少兩人批准：

```text
Security Owner
Release Owner
```

開發者不能單人完成：

```text
合併
簽名
發布
```

---

# 25. 測試策略

## 25.1 測試層級

```text
Unit
Widget
Golden
Integration
Native Security
Chain Test Vector
RPC Contract
End-to-End
Mainnet Small Amount
Penetration Test
```

## 25.2 助記詞與地址

至少：

- 官方 BIP39 向量
- 10,000 組隨機 Seed
- Android / iOS 地址一致
- 建立後導入一致
- 多帳戶一致
- 每個鏈地址校驗
- 錯誤助記詞拒絕
- Checksum 錯誤拒絕

## 25.3 每條鏈

每個鏈家族至少測試：

1. 建立地址
2. 導入恢復
3. 查原生幣餘額
4. 查 Token 餘額
5. 收款 QR
6. 原生幣轉帳
7. Token 轉帳
8. 最低餘額
9. 費用不足
10. 無效地址
11. 重複廣播
12. Pending
13. Confirmed
14. Failed
15. Reorg / Dropped（適用時）
16. RPC 故障
17. 節點落後
18. 錯誤 Chain ID

## 25.4 真機

Android：

- Google Pixel
- Samsung
- Xiaomi
- OPPO / OnePlus
- 至少一台 StrongBox
- 至少一台只有 TEE
- Android 最低版本
- Android 最新版本

iOS：

- 最低支持 iOS
- 最新 iOS
- Face ID
- Touch ID（如仍支持）
- 低存儲
- 低電量
- 系統語言切換

---

# 26. 外部安全審計

審計範圍：

- 助記詞生成
- Seed 保存
- PIN
- Biometrics
- Flutter / Native 邊界
- Clipboard
- Screenshot
- 日誌
- Deep Link
- RPC
- 交易顯示與簽名一致性
- 各鏈序列化
- 依賴供應鏈
- 更新流程
- CI/CD
- APK / IPA 逆向

發布要求：

```text
Critical = 0
High = 0
Medium = 已修復或有書面接受
Low = 有排期
```

---

# 27. 開發階段

## Phase 0：授權與基線（1 週）

- 取得上游書面修改和商業分發授權
- 固定 Commit
- 建立私有 Fork
- 完成依賴 License Review
- 完成 Threat Model
- 成功編譯 Android / iOS
- 生成基線 APK / IPA
- 建立全鏈現況矩陣

## Phase 1：品牌與 Design System（2 週）

- 新 Logo
- App Icon
- Splash
- Theme
- Typography
- Spacing
- Components
- 中文繁體
- 中文簡體
- 英文
- 首頁
- 導航
- Onboarding

## Phase 2：核心 UI 重構（2–3 週）

- 建立 / 導入
- 助記詞
- 首頁
- 資產
- 收款
- 轉帳
- 交易確認
- 交易狀態
- 設定
- 錢包管理

## Phase 3：安全加固（2 週）

- Keychain / Keystore
- Screenshot
- Background Mask
- Logging
- Root / Jailbreak
- PIN Policy
- Auto-lock
- Secure Delete
- Sensitive Data Scan

## Phase 4：全鏈回歸（3–5 週）

- 逐鏈測試
- 修復上游 Bug
- RPC Failover
- Token Manifest
- Chain Registry
- Fee
- History
- Recovery
- Mainnet Read-only 測試

## Phase 5：審計與發布（3–5 週）

- 外部審計
- 修復
- 再測試
- 主網小額
- 內部灰度
- 1%
- 5%
- 25%
- 100%

預估：

```text
10–16 週
```

即使大部分功能來自開源，全鏈生產測試和安全審計仍不能省略。

---

# 28. 驗收標準

## 28.1 功能

- 所有 Production Enabled 鏈均可建立、恢復、收款、轉帳。
- Android / iOS 地址一致。
- 同一助記詞恢復結果一致。
- 所有資產顯示明確網絡。
- RPC 故障可以切換。
- 交易狀態可追蹤。
- 自訂 EVM 網絡可添加。
- 自訂 Token 可添加。

## 28.2 安全

- 私鑰不離開設備。
- 助記詞不進入日誌。
- 助記詞頁禁止截圖。
- 轉帳前重新認證。
- 未審計 Raw Sign 不存在。
- Production 無測試 Seed。
- 所有依賴已固定。
- SBOM 已生成。
- Critical / High 漏洞為 0。

## 28.3 UI

- Figma 與 App 一致。
- 中文無溢出。
- 深色模式完整。
- 主要流程無死路。
- 錯誤可恢復。
- 網絡信息不被隱藏。
- 不使用上游商標。

---

# 29. 主網發布門檻

必須全部完成：

- [ ] 書面商業修改和分發授權
- [ ] 第三方 License Review
- [ ] Threat Model
- [ ] Android / iOS Release Build
- [ ] 全鏈測試矩陣完成
- [ ] 外部安全審計
- [ ] Critical = 0
- [ ] High = 0
- [ ] 至少 100 筆主網小額交易
- [ ] 至少 30 天內部使用
- [ ] RPC Failover 實測
- [ ] Incident Runbook
- [ ] Emergency Read-only Config
- [ ] App Store / Play Store 隱私資料完成
- [ ] Release Key 離線備份
- [ ] 回滾版本已驗證

---

# 30. 長期維護策略

## 30.1 目標

讓我們的 Fork 與上游差距盡量小。

## 30.2 只保留三類自有代碼

```text
1. Branding / UI
2. Security Hardening
3. Provider / Product Integration
```

## 30.3 不做永久大改

禁止：

- 重命名所有上游類
- 重構所有資料模型
- 更換全部狀態管理
- 更換全部數據庫
- 重寫所有鏈
- 大規模搬動目錄
- 無必要抽象

## 30.4 上游回饋

對通用 Bug：

```text
本地修復
  ↓
提交 Upstream PR
  ↓
上游合併
  ↓
下次同步刪除本地 Patch
```

---

# 31. 已知限制與風險

## 31.1 授權風險

首選上游當前 License 含不得修改文字。

這是最高優先級風險。

未取得書面授權，不得商業發布。

## 31.2 「全鏈」風險

鏈數越多：

- RPC 越多
- Edge Case 越多
- 測試越多
- 安全風險越多
- 維護成本越高

因此使用：

```text
compiled = true
production_enabled = false/true
```

分離「代碼存在」與「生產啟用」。

## 31.3 小型上游維護風險

首選上游社群和審計成熟度可能不如大型商業錢包。

必須：

- 自己完成安全審計
- 自己建立測試向量
- 自己維護 Patch
- 自己準備回退方案

## 31.4 無後端限制

- API Key 無法完全保密
- 無推送入帳
- 無雲端同步
- 無找回服務
- 無中央風控
- 無緊急凍結用戶資產

這是非託管設計的一部分。

---

# 32. 開發者啟動命令

## 32.1 建立私有 Fork

```bash
git clone https://github.com/mrtnetwork/onchain_wallet.git wallet
cd wallet

git remote rename origin upstream
git remote add origin git@github.com:<company>/<wallet-repo>.git

git checkout b3fb70fc67647dd271f3aa7442520370d59861c9
git checkout -b company-main

git push -u origin company-main
```

## 32.2 Flutter

```bash
flutter doctor -v
flutter pub get
flutter analyze
flutter test
```

## 32.3 Android

依照上游工具：

```bash
dart run tool/build.dart apk
```

另建立正式：

```bash
flutter build appbundle --release
```

在實際上游構建結構確認後，以可重現 CI 命令為準。

## 32.4 iOS

```bash
cd ios
pod install --repo-update
cd ..

flutter build ios --release --no-codesign
```

正式 Archive 使用 Xcode / CI。

## 32.5 基線標籤

```bash
git tag baseline/upstream-b3fb70f
git push origin baseline/upstream-b3fb70f
```

---

# 33. 配置文件範例

## 33.1 Chain Registry

```yaml
chains:
  - id: tron
    family: tron
    name: TRON
    native_symbol: TRX
    coin_type: 195
    production_enabled: true
    capabilities:
      tokens: true
      memo: false
      resource_model: true
      web3: false

  - id: ethereum
    family: evm
    name: Ethereum
    chain_id: 1
    native_symbol: ETH
    production_enabled: true
    capabilities:
      tokens: true
      eip1559: true
      web3: false
```

## 33.2 RPC Registry

```yaml
rpc:
  tron:
    - url: ${TRON_RPC_1}
      priority: 10
    - url: ${TRON_RPC_2}
      priority: 20

  ethereum:
    - url: ${ETH_RPC_1}
      priority: 10
    - url: ${ETH_RPC_2}
      priority: 20
```

## 33.3 Feature Flags

```yaml
features:
  wallet_create: true
  wallet_import: true
  send: true
  receive: true
  custom_token: true
  custom_evm_network: true

  swap: false
  bridge: false
  wallet_connect: false
  dapp_browser: false
  staking: false
  nft: false
  fiat_onramp: false
```

## 33.4 Upstream Lock

```yaml
upstreams:
  - name: onchain_wallet
    repository: https://github.com/mrtnetwork/onchain_wallet
    commit: b3fb70fc67647dd271f3aa7442520370d59861c9
    integration: full_app_fork
    license_status: written_permission_required
    auto_upgrade: false
```

---

# 34. 交付物清單

開發團隊最終交付：

```text
1. 完整 Git 倉庫
2. Android AAB
3. Android APK
4. iOS Archive
5. TestFlight Build
6. Figma
7. Design System
8. Chain Registry
9. Token Manifest
10. RPC Registry
11. Feature Flags
12. UPSTREAMS.lock.yaml
13. THIRD_PARTY_NOTICES.md
14. SBOM
15. Threat Model
16. 安全審計報告
17. 修復報告
18. 全鏈測試矩陣
19. Mainnet 小額測試報告
20. Release Runbook
21. Incident Runbook
22. 回滾方案
23. Build Reproducibility 文件
24. Android / iOS Signing Handover
```

---

# 35. 授權申請郵件模板

**Subject: Request for Commercial Modification and Distribution Permission for OnChain Wallet**

```text
Hello,

We are evaluating the OnChain Wallet project as the technical foundation
for a branded, self-custodial, multi-chain mobile wallet.

We would like to request explicit written permission to:

1. Modify the source code and user interface
2. Replace the branding, application name, icons and visual design
3. Distribute modified Android and iOS builds commercially
4. Maintain a private derivative repository
5. Apply security fixes and product-specific integrations
6. Publish the modified application through Apple App Store and Google Play

We will preserve all legally required copyright notices, third-party
licenses and attribution.

The current repository license contains language stating that the work
may not be modified. Therefore, we would like a separate written license
or written clarification that expressly permits the activities above.

Please also confirm whether any commercial fee, attribution requirement,
source-code disclosure obligation, trademark restriction or other
condition would apply.

Thank you.
```

保存作者回覆與簽署文件到：

```text
docs/legal/upstream-license/
```

---

# 36. 最終 Definition of Done

項目只有在下列全部完成時，才可稱為 V1 生產版完成。

## 法律

- [ ] 已取得上游書面修改權
- [ ] 已取得商業分發權
- [ ] 已完成第三方 License Review
- [ ] 已建立 Attribution 頁

## 開發

- [ ] 品牌全部替換
- [ ] UI 全部完成
- [ ] Android 編譯成功
- [ ] iOS 編譯成功
- [ ] 所有依賴固定
- [ ] 沒有浮動 Git Ref
- [ ] 沒有第二套簽名引擎

## 鏈

- [ ] 所有 Production Enabled 鏈完成矩陣
- [ ] 所有鏈恢復一致
- [ ] 所有鏈收款正確
- [ ] 所有鏈轉帳正確
- [ ] 所有鏈費用正確
- [ ] RPC 故障切換正確
- [ ] 錯誤網絡可阻斷

## 安全

- [ ] 助記詞只在本地生成
- [ ] 24 詞新建錢包
- [ ] Keychain / Keystore 完成
- [ ] 截圖保護完成
- [ ] 日誌清洗完成
- [ ] 生物識別完成
- [ ] 自動鎖定完成
- [ ] Raw Sign 關閉
- [ ] 外部審計完成
- [ ] Critical = 0
- [ ] High = 0

## 發布

- [ ] 100 筆主網小額測試
- [ ] 30 天內部使用
- [ ] 灰度發布完成
- [ ] Incident Runbook 完成
- [ ] 回滾可用
- [ ] SBOM 已歸檔
- [ ] Release Hash 已歸檔
- [ ] 商店材料已完成

---

# 最終執行口令

開發團隊應以以下原則執行：

> **不從零重造錢包，不重寫上游已完成的鏈邏輯，不同時引入多套簽名引擎。先取得合法修改權，再固定上游 Commit，保留 85%–95% 上游代碼，主要完成品牌 UI、安全加固、全鏈驗證、供應商配置和生產發布。**

> **「支持全部鏈」指支持固定上游中已實現並經我們完整測試的全部鏈家族，而不是未經驗證地宣稱支持世界上每一條鏈。**

> **任何未通過鏈測試矩陣或安全審計的鏈，即使代碼已存在，也不得在 Production 中啟用。**
