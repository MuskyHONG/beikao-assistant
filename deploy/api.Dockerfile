FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
# The API compiles with tsc. It does not need dependency install hooks.
RUN npm ci --workspace @beikao/api --ignore-scripts
COPY apps/api apps/api
RUN npm run build -w @beikao/api
RUN npm prune --workspace @beikao/api --omit=dev --ignore-scripts

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=43127
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/migrations ./apps/api/migrations
COPY --from=build --chown=node:node /app/apps/api/seed ./apps/api/seed
USER node
EXPOSE 43127
CMD ["node", "apps/api/dist/server.js"]
