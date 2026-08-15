FROM node:22.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/outbox-publisher/package.json services/outbox-publisher/package.json
RUN npm ci --ignore-scripts --workspace=@hidotpay/outbox-publisher
COPY services/outbox-publisher services/outbox-publisher
RUN npm run build --workspace=@hidotpay/outbox-publisher

FROM node:22.19.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/package.json /app/package.json
COPY --from=build --chown=node:node /app/services/outbox-publisher/package.json /app/services/outbox-publisher/package.json
COPY --from=build --chown=node:node /app/services/outbox-publisher/dist /app/services/outbox-publisher/dist
USER node
CMD ["node", "--enable-source-maps", "services/outbox-publisher/dist/cli/run-publisher.js"]
