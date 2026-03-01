FROM node:22-bookworm-slim AS base
RUN apt-get update -y && apt-get install -y openssl postgresql-client && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOME=/tmp
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/public ./public
# Copy full node_modules first (ensures all prisma CLI transitive deps are present)
COPY --from=deps /app/node_modules ./node_modules
# Copy standalone output on top (its node_modules merges/overrides)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
# Copy generated Prisma client (after standalone to ensure not overwritten)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY seed.js ./seed.js
COPY start.sh ./start.sh
RUN chmod +x start.sh

EXPOSE 3000
CMD ["./start.sh"]
