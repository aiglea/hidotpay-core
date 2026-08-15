# OpenBao 密鑰保護部署邊界

HiDot Pay 使用 [OpenBao](https://openbao.org/) 作為自託管的秘密與加密服務，不把客戶資產或私鑰交給第三方託管。OpenBao Transit 可做加密、解密、簽名與金鑰版本管理；但它目前不直接提供 EVM/TRON 所需的 secp256k1 錢包交易格式服務。因此不能把「Transit 能簽名」錯當成「可以安全廣播所有鏈上提款」。

## 分工

- OpenBao：保護錢包金鑰材料的加密封套、輪替、稽核及工作負載身分。
- EVM：使用 Apache-2.0 的 Web3Signer 作為遠端 secp256k1 簽名器；僅由提幣 worker 可呼叫。
- TRON：在測試網前僅允許政策驗證；主網必須先採用可稽核的 secp256k1 HSM／隔離簽名器並完成外部安全審計。
- CockroachDB：只保存 key version、衍生索引、公開地址和稽核 reference；禁止保存助記詞、私鑰或 OpenBao token。

## 上線前必須完成

1. 以至少三個 OpenBao 節點、TLS、Raft HA storage 與獨立 auto-unseal 建立私有網路；不得使用 dev server、單節點 file storage 或把 root token 寫入環境檔。
2. 啟用 Audit device，並把 audit log 寫往獨立不可修改的日誌儲存。
3. 只將 `policies/hidotpay-signer.hcl` 掛給 signer 的工作負載身分；API、worker、後台各自另用更小權限的身分。
4. 建立 `hidotpay-wallet-envelope` Transit key，開啟版本輪替程序；每次輪替必須保留舊版本可解密既有密文。
5. Web3Signer 與 signer API 只放在私有子網，採 mTLS、網路策略與獨立服務帳號；不開放 internet ingress。
6. 在測試網完成地址衍生、簽名、廣播、重送、回滾與密鑰輪替演練，再由獨立安全審計放行主網。

## 明確禁止

- 不可把 seed、private key、助記詞、OpenBao root token、恢復金鑰或 keystore 密碼放入 Git、CockroachDB、前端、NocoBase 或一般應用日誌。
- 不可讓 `ledger-api` 直接呼叫簽名器；只有已獲雙人審批且通過風控的 `withdrawal-worker` 可提出簽名請求。
- 在 `MAINNET_SIGNING_ENABLED` 尚未由變更管理與演練批准前，所有主網請求必須由 signer policy 拒絕。
