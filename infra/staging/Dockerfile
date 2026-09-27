# One image for every staging process (api, worker, web, admin, init). Built on the server.
FROM node:22-bookworm-slim
ENV CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# Server-side address of the API for the web/admin `/api` proxy (baked into the Next.js build).
ENV API_INTERNAL_URL=http://api:4000
RUN pnpm build
