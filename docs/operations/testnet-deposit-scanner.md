# 測試網充值掃描（staging）

這份文件只描述 **staging／測試網** 掃描器。它不能保管真實資產，也不是主網入帳許可。

## 已部署

- 掃描器：`https://hidotpay-deposit-scanner-staging.lgninhk.workers.dev/healthz`
- 帳本入帳：`POST https://hidotpay-native-ledger-staging.lgninhk.workers.dev/v1/deposits/confirmed`
- 排程：每分鐘一次 Cloudflare cron
- 身分：Worker Secret `CHAIN_OPERATOR_TOKEN`（帳本與掃描器共用）。掃描器以 `NATIVE_LEDGER` service binding 呼叫帳本，不把權杖放進瀏覽器。

## 公開測試網 RPC

操作者已授權使用公開測試網端點。沒有鑰匙圈裡的私有 RPC。

| 網路 | chain id / 識別 | RPC（依序 failover） |
| --- | --- | --- |
| `ethereum-sepolia` | 11155111 | `https://ethereum-sepolia-rpc.publicnode.com`、`https://1rpc.io/sepolia`、`https://gateway.tenderly.co/public/sepolia` |
| `base-sepolia` | 84532 | `https://base-sepolia-rpc.publicnode.com`、`https://sepolia.base.org` |
| `avalanche-fuji` | 43113 | `https://avalanche-fuji-c-chain-rpc.publicnode.com`、`https://api.avax-test.network/ext/bc/C/rpc` |
| `tron-shasta` | genesis `0000000000000000de1aa88295e1fcf982742f773e0419c5a9c134c994a9059e` | `https://api.shasta.trongrid.io` |
| `bitcoin-testnet4` | testnet4 | `https://mempool.space/testnet4/api` |
| `solana-devnet` | devnet | `https://api.devnet.solana.com`、`https://solana-devnet-rpc.publicnode.com` |
| `xrpl-testnet` | testnet | `https://testnet.xrpl-labs.com` |
| `stellar-testnet` | testnet | `https://horizon-testnet.stellar.org` |

失敗關閉：單一 RPC 錯誤或 chain id／genesis 不符會改試下一個；全部失敗則該輪掃描失敗，不前進游標、不入帳。

## 官方測試資產

| 網路 | 資產 | 合約 | 確認數 |
| --- | --- | --- | --- |
| ethereum-sepolia | USDT | `0x7169D38820dfd117C3FA1f22a697dBA58d90BA06` | 12 |
| tron-shasta | USDT | `TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj` | 19 |
| avalanche-fuji | USDT | `0xAb231A5744C8E6c45481754928cCfFFFD4aa0732` | 12 |
| base-sepolia | USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | 20 |
| bitcoin-testnet4 | BTC | `native:btc` | 3 |
| solana-devnet | USDC | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | 32 |
| xrpl-testnet | XRP | `native:xrp` | 1 |
| stellar-testnet | USDC | `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` | 1 |

Sepolia／Fuji 上的 USDT **不是** Tether 官方發行。Base／Solana／Stellar 用的是 Circle 官方測試 USDC。BNB、Polygon、Arbitrum、Optimism、Linea、Scroll、TON 測試網可配置地址，但沒有已驗證的公開測試 USDT，掃描器不會為它們入帳。主網合約不會被入帳。

已配置為 `ethereum`／`tron` 的舊地址仍會被當成 Sepolia／Shasta 別名掃描；新地址使用官方測試網名稱。

## 游標

第一次掃描若沒有游標，會把游標寫在 `head - 32`，不回補歷史。使用者必須在掃描器上線後再轉入測試幣。

Hyperdrive 使用 `hidotpay_ledger_runtime`。掃描器需要對 `chain_scan_cursors` 與 `chain_deposit_observations` 的 `SELECT, INSERT, UPDATE`；見 `deployment/cloudflare/scanner-runtime-grants.sql`。沒有這些權限時，掃描會失敗關閉，不會前進游標。

## 禁止

- 不得設定主網 RPC 或主網合約
- 不得把 `CHAIN_OPERATOR_TOKEN` 寫進 Git、錢包 App 或 NocoBase
- 不得開啟 `WITHDRAWALS_ENABLED`
