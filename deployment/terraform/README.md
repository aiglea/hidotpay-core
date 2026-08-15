# AWS 三可用區金融基線

這個 Terraform 目錄只建立 HiDot Pay 的**私有網路與 EKS 基礎**：三個可用區、每區一個 NAT Gateway、三個私有子網、私有 EKS 控制平面、三個起始工作節點與 Kubernetes Secret 的 KMS 加密。它不建立任何真實錢包金鑰、資料庫密碼、Blnk 金鑰或使用者資產。

## 先決條件

正式環境必須使用獨立 AWS 帳號、獨立 S3 state bucket 與 DynamoDB state lock。S3 bucket 必須啟用版本化、KMS 加密、封鎖公開存取；Terraform 執行身分只可操作這個環境的資源。不要在個人帳號或本機 state 執行 production。

管理 EKS 的人或 CI 必須位於已批准的私有網路（VPN／bastion）內；本設定刻意關閉公開 Kubernetes API。EKS 的服務帳號存取 AWS 資源時，要再為每個服務設定獨立的 EKS Pod Identity 或 IRSA 最小權限角色，不能共用 node role。

## 初始化（只在已完成變更審核後）

```sh
cd deployment/terraform
terraform init \
  -backend-config="bucket=你的獨立state-bucket" \
  -backend-config="key=hidotpay/production/terraform.tfstate" \
  -backend-config="region=你的AWS區域" \
  -backend-config="dynamodb_table=你的state-lock-table" \
  -backend-config="encrypt=true"

terraform plan \
  -var='aws_region=你的AWS區域' \
  -var='environment=production' \
  -var='name_prefix=hidotpay-production'
```

先由第二位具權限的人覆核 plan，再由受控 CI 套用。任何資料庫、Redpanda、Temporal、OpenBao/Blnk 都必須另有其跨可用區部署、備份還原與故障演練證明；建立 EKS 不代表這些資金服務已經上線。

## 本機檢查

```sh
sh deployment/terraform/smoke-test.sh
```

若已安裝 Terraform，另外執行 `terraform fmt -check` 與以隔離後端設定的 `terraform validate`。本工作區目前沒有 Terraform 執行檔，因此不能捏造 validate 或 AWS apply 的結果。
