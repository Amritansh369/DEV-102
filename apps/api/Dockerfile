# API image. Build from the repo root: docker build -f apps/api/Dockerfile -t dev102-api .
FROM node:22-bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Every workspace manifest is needed for `npm ci` to match the lockfile; only the API's deps are installed.
# --ignore-scripts skips the Electron and embedded-Postgres downloads the API never uses.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/desktop/package.json apps/desktop/package.json
RUN npm ci --workspace apps/api --include-workspace-root --ignore-scripts --no-audit --no-fund

COPY database/prisma database/prisma
COPY apps/api apps/api
RUN npx prisma generate --schema database/prisma/schema.prisma

ENV NODE_ENV=production \
    PORT=4000 \
    EVIDENCE_DIR=/data/evidence
EXPOSE 4000

# Apply pending migrations, then serve.
CMD ["sh", "-c", "npx prisma migrate deploy --schema database/prisma/schema.prisma && npm start -w apps/api"]
