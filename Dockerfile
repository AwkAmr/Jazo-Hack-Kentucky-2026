# syntax=docker/dockerfile:1

# JAZO runs as a Node server (not a static export) because every interview turn
# goes through a route handler. Built in three stages so the deploy artifact is
# just `.next/standalone` — no `npm install` on the box.

# ---- deps ----------------------------------------------------------------
# Separate stage so a source-only change doesn't reinstall node_modules.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder -------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# No secrets are needed here: every API key is read from process.env inside a
# route handler at request time, and there are no NEXT_PUBLIC_* vars to inline.
# That's what makes one image reusable across environments.
RUN npm run build

# ---- runner --------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Default is localhost, which would be unreachable from Caddy's container.
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nextjs -G nodejs

# `output: 'standalone'` emits server.js plus only the traced node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# standalone intentionally leaves these two out; server.js picks them up when
# they are present, which is what we want with no CDN in front.
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# wget ships with busybox, so no extra layer just to probe ourselves.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
