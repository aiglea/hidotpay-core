FROM node:22.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/ledger-api/package.json services/ledger-api/package.json
RUN npm ci --ignore-scripts --workspace=@hidotpay/ledger-api
COPY services/ledger-api services/ledger-api
RUN npm run build --workspace=@hidotpay/ledger-api

FROM node:22.19.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/package.json /app/package.json
COPY --from=build --chown=node:node /app/services/ledger-api/package.json /app/services/ledger-api/package.json
COPY --from=build --chown=node:node /app/services/ledger-api/dist /app/services/ledger-api/dist
USER node
CMD ["node", "--enable-source-maps", "services/ledger-api/dist/server.js"]
