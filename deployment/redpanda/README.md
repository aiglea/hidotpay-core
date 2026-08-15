# Redpanda 開發環境

這份 Compose 只用於本機開發與驗證。Kafka 連接埠 `19092`、管理連接埠 `19644` 都只綁定在 `127.0.0.1`，不會直接公開到網路。

啟動：

```sh
docker compose -f deployment/redpanda/docker-compose.development.yaml up -d
```

它會建立唯一正式事件 topic：`hidotpay.events.v1`，3 個 partition、單副本。程式只可向這個 topic 發送版本化事件，Kafka key 必須是 outbox event ID，消費端也以該 ID 去重。

本機 Compose 不等於正式高可用部署。正式環境需使用三個或更多 broker、跨可用區磁碟、TLS、SASL/ACL、topic replication factor 3、`min.insync.replicas` 至少 2、私有網路與監控告警。不得把本機 19092 直接暴露到公網。
