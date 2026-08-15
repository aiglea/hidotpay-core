FROM node:22.19.0-bookworm-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY services/ledger-api/package.json services/ledger-api/package.json
RUN npm ci --ignore-scripts --workspace=@hidotpay/ledger-api
COPY services/ledger-api services/ledger-api
RUN npm run build --workspace=@hidotpay/ledger-api
CMD ["node", "--enable-source-maps", "services/ledger-api/dist/server.js"]
