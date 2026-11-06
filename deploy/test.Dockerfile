FROM node:24-bookworm-slim
ARG NPM_CONFIG_REGISTRY
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
# Vite and tsx use the esbuild binary from its optional platform package.
RUN npm ci --ignore-scripts --include=optional
COPY . .
