# Benchdesk

Independent, repeatable VPS benchmarks — [benchdesk.net](https://benchdesk.net).

Stack: Next.js (App Router, TypeScript), Tailwind CSS v4, PostgreSQL + Drizzle ORM, Docker Compose + Caddy, behind Cloudflare.

## Layout

```
src/app/            pages (home, /methodology)
src/components/     UI components
src/lib/db/         Drizzle schema and lazy DB client
src/lib/data.ts     queries used by pages (request time only)
src/lib/trials.ts   saving/deleting test results, score recomputation
src/lib/bench/      bench.sh + submission parsers
src/lib/yabs/       yabs.sh parser + fixtures
public/bench.sh     the benchmark script testers run
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

## Admin panel

`https://benchdesk.net/admin` — add and edit providers, plans and locations.
Login is disabled until `ADMIN_PASSWORD` and `SESSION_SECRET` are set in `.env`
(then `docker compose up -d` to apply). Generate both with `openssl rand -hex 24`;
use hex values, because `$` in `.env` is interpolated by Docker Compose.
Failed logins are limited to 5 per IP per 15 minutes.

## Test results

On a fresh test server, inside tmux:

    curl -sL https://benchdesk.net/bench.sh | bash -s -- --hours 48 | tee bench.txt

then paste everything into `/admin/trials`. `public/bench.sh` runs sysbench and the
7-Zip benchmark, then yabs.sh (pinned commit, `-g` = no Geekbench) for disk and network
(~20 min). With `--hours N` it then samples every 30 minutes for N hours: sysbench on
1 and all threads (20 s each, CPU steal read during the latter) and fio 4K randrw (20 s).
Without `--hours` there is no stability score.
Plain yabs.sh output (text or `-j` JSON) is accepted too; it just has no CPU score.

- Parsers: `src/lib/bench/submission.ts` (entry point), `src/lib/bench/cpu.ts`, `src/lib/bench/stability.ts`,
  `src/lib/yabs/parse.ts`. Stability samples go to `endurance_points`; the summary (variation, worst 5%,
  steal, disk variation) to `metrics` as `stability_*`.
  Implausible values and duplicate pastes are rejected; the raw output is kept in `raw_results`.
- **Geekbench is never stored**: its license doesn't cover publishing scores here (15.11.2026).
- **Official** results are scored and ranked; **community** results are stored but never ranked.
- Scores (`src/lib/scoring.ts`) are percentiles among all official tests, so every
  save or delete recomputes all scores. Bump `METHODOLOGY_VERSION` when the formula changes.
- Changing `bench.sh`: bump `BENCH_VERSION`; when updating yabs, pin the new commit in `YABS_COMMIT`.

Unit tests: `npm test` (parsers and scoring, no database needed).

## Backups

`scripts/backup.sh` writes a gzipped `pg_dump` to `~/backups` and keeps 14 days.
Raff's daily VM backups capture that folder too. Install the nightly job (04:00 UTC):

```bash
(crontab -l 2>/dev/null; echo "0 4 * * * $HOME/benchdesk/scripts/backup.sh >> $HOME/backups/backup.log 2>&1") | crontab -
```

Restore a backup into the running database (replaces current data):

```bash
gunzip -c ~/backups/benchdesk-YYYY-MM-DD_HHMM.sql.gz | docker compose exec -T db sh -c 'dropdb -U benchdesk --force benchdesk && createdb -U benchdesk benchdesk && psql -q -o /dev/null -U benchdesk benchdesk'
```

## Principles

- Raw results are always stored; scores can be recomputed when the methodology changes.
- Community (yabs.sh) results are labeled unverified and never mixed into official rankings.
- Sponsored providers and affiliate links are always labeled; sponsorship never changes a score.
- No sample or made-up numbers on the live site.
