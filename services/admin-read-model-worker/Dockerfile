FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY services/admin-read-model-worker/package.json services/admin-read-model-worker/package.json
RUN npm ci --workspace=@hidotpay/admin-read-model-worker --include-workspace-root
COPY services/admin-read-model-worker services/admin-read-model-worker
RUN npm run build --workspace=@hidotpay/admin-read-model-worker

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY services/admin-read-model-worker/package.json services/admin-read-model-worker/package.json
RUN npm ci --omit=dev --workspace=@hidotpay/admin-read-model-worker --include-workspace-root \
  && npm cache clean --force
COPY --from=build /app/services/admin-read-model-worker/dist services/admin-read-model-worker/dist
USER node
CMD ["node", "services/admin-read-model-worker/dist/cli/run-once.js"]
