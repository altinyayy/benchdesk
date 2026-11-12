# Benchdesk

Independent, repeatable VPS benchmarks — [benchdesk.net](https://benchdesk.net).

Stack: Next.js (App Router, TypeScript), Tailwind CSS v4, PostgreSQL + Drizzle ORM, Docker Compose + Caddy, behind Cloudflare.

## Layout

```
src/app/            pages (home, /methodology)
src/components/     UI components
src/lib/db/         Drizzle schema and lazy DB client
src/lib/data.ts     queries used by pages (request time only)
drizzle/            generated SQL migrations
scripts/migrate.mjs applies migrations (docker compose service "migrate")
caddy/Caddyfile     reverse proxy config (certs are NOT in git)
```

## Local development

```bash
npm install
cp .env.example .env.local   # set DATABASE_URL=postgres://... for a local Postgres
npm run dev
```

After changing `src/lib/db/schema.ts`, generate a migration and commit it:

```bash
npx drizzle-kit generate --name short-description
```

## Deploy (server)

The app lives in `~/benchdesk` on the server, cloned with a read-only deploy key.
The Cloudflare Origin certificate is in `~/benchdesk/caddy/certs/` (`origin.pem`, `origin.key`) and stays out of git.

First time:

```bash
cp .env.example .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
docker compose up -d --build
```

Every update:

```bash
cd ~/benchdesk && git pull && docker compose up -d --build
```

Logs: `docker compose logs -f app` · Status: `docker compose ps`

## Principles

- Raw results are always stored; scores can be recomputed when the methodology changes.
- Community (yabs.sh) results are labeled unverified and never mixed into official rankings.
- Sponsored providers and affiliate links are always labeled; sponsorship never changes a score.
- No sample or made-up numbers on the live site.
