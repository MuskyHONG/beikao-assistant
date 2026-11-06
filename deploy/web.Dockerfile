FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json VERSION ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
# Use esbuild's platform package and skip its install-time binary check.
RUN npm ci --workspace @beikao/web --ignore-scripts --include=optional
COPY apps/web apps/web
RUN npm run build -w @beikao/web

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 43128
