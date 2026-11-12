#!/usr/bin/env bash
# Daily logical backup of the Benchdesk database.
# Runs from cron (see README). Keeps the last 14 days in ~/backups.
# Raff's daily VM backups also capture this folder, so copies exist off the server.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

file="$BACKUP_DIR/benchdesk-$(date -u +%Y-%m-%d_%H%M).sql.gz"
tmp="$file.partial"

cd "$APP_DIR"
docker compose exec -T db pg_dump -U benchdesk --no-owner benchdesk | gzip -9 > "$tmp"
mv "$tmp" "$file"

find "$BACKUP_DIR" -name 'benchdesk-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) backup ok: $file ($(du -h "$file" | cut -f1))"
