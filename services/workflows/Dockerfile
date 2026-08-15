FROM node:22.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/workflows/package.json services/workflows/package.json
RUN npm ci --ignore-scripts --workspace=@hidotpay/workflows
COPY services/workflows services/workflows
RUN npm run build --workspace=@hidotpay/workflows

FROM node:22.19.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/package.json /app/package.json
COPY --from=build --chown=node:node /app/services/workflows/package.json /app/services/workflows/package.json
COPY --from=build --chown=node:node /app/services/workflows/dist /app/services/workflows/dist
USER node
CMD ["node", "--enable-source-maps", "services/workflows/dist/cli/run-dispatcher.js"]
