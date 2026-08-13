# HidoTPay Financial Core

這是 HidoTPay 的中央帳本服務：處理平台內部轉帳、鏈上確認後的充值入帳，以及需經審核的外部提現。

## 文件導覽

- [快速開始](quick-start.md)：在本機安全地啟動。
- [API](api.md)：每個 API 的用途與請求規則。
- [安全與帳務規則](security.md)：不可破壞的資金規則。
- [營運手冊](operations.md)：上線前與日常操作。
- [公網開發版](public-development-deployment.md)：開發 API 的 HTTPS 網址與保護方式。

> 此服務目前**不保管私鑰、不簽名、不廣播鏈上交易**。鏈上錢包與 MPC 簽名系統必須以獨立服務接入，不能把私鑰放進這個 API 或資料庫。
