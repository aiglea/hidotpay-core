FROM node:22.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/ledger-api/package.json services/ledger-api/package.json
COPY services/reconciliation-worker/package.json services/reconciliation-worker/package.json
RUN npm ci --ignore-scripts --workspace=@hidotpay/ledger-api --workspace=@hidotpay/reconciliation-worker
COPY services/ledger-api services/ledger-api
COPY services/reconciliation-worker services/reconciliation-worker
RUN npm run build --workspace=@hidotpay/ledger-api && npm run build --workspace=@hidotpay/reconciliation-worker

FROM node:22.19.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/package.json /app/package.json
COPY --from=build --chown=node:node /app/services/ledger-api/package.json /app/services/ledger-api/package.json
COPY --from=build --chown=node:node /app/services/ledger-api/dist /app/services/ledger-api/dist
COPY --from=build --chown=node:node /app/services/reconciliation-worker/package.json /app/services/reconciliation-worker/package.json
COPY --from=build --chown=node:node /app/services/reconciliation-worker/dist /app/services/reconciliation-worker/dist
USER node
CMD ["node", "--enable-source-maps", "services/reconciliation-worker/dist/cli/run-temporal-worker.js"]
