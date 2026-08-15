FROM node:22.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/deposit-worker/package.json services/deposit-worker/package.json
RUN npm ci --ignore-scripts --workspace=@hidotpay/deposit-worker
COPY services/deposit-worker services/deposit-worker
RUN npm run build --workspace=@hidotpay/deposit-worker

FROM node:22.19.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/package.json /app/package.json
COPY --from=build --chown=node:node /app/services/deposit-worker/package.json /app/services/deposit-worker/package.json
COPY --from=build --chown=node:node /app/services/deposit-worker/dist /app/services/deposit-worker/dist
USER node
CMD ["node", "--enable-source-maps", "services/deposit-worker/dist/cli/run-deposit-worker.js"]
