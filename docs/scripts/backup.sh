#!/usr/bin/env bash
# =============================================================================
# MuzaLife Backend — Automated Backup Script
#
# Usage:
#   chmod +x docs/scripts/backup.sh
#   ./docs/scripts/backup.sh              # incremental (DB only)
#   ./docs/scripts/backup.sh --full       # full (DB + uploads + config)
#
# Cron example (run from project root):
#   0 3 * * * /home/muzalife/muzalife_backend/docs/scripts/backup.sh
#   0 2 * * 0 /home/muzalife/muzalife_backend/docs/scripts/backup.sh --full
# =============================================================================

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_ROOT="/var/backups/muzalife"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FULL_BACKUP=false

# Parse args
for arg in "$@"; do
  [[ "$arg" == "--full" ]] && FULL_BACKUP=true
done

# Load env
set -a; source "$PROJECT_ROOT/.env"; set +a
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-muzalife_user}"
DB_NAME="${DB_NAME:-muzalife}"

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; CYAN='\033[0;36m'; RED='\033[0;31m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[$(date +%H:%M:%S)] INFO${RESET}  $*"; }
success() { echo -e "${GREEN}[$(date +%H:%M:%S)] OK${RESET}    $*"; }
error()   { echo -e "${RED}[$(date +%H:%M:%S)] ERROR${RESET} $*"; exit 1; }

# ── Create backup directories ─────────────────────────────────────────────────
mkdir -p "$BACKUP_ROOT/db" "$BACKUP_ROOT/config" "$BACKUP_ROOT/uploads"

# ── 1. Database backup ────────────────────────────────────────────────────────
info "Backing up PostgreSQL database '$DB_NAME'..."
DB_BACKUP_FILE="$BACKUP_ROOT/db/muzalife_${TIMESTAMP}.dump"

PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -F c \
  -f "$DB_BACKUP_FILE"

success "Database backup: $DB_BACKUP_FILE ($(du -sh "$DB_BACKUP_FILE" | cut -f1))"

# ── 2. Config backup ──────────────────────────────────────────────────────────
info "Backing up configuration files..."
CONFIG_BACKUP="$BACKUP_ROOT/config/$TIMESTAMP"
mkdir -p "$CONFIG_BACKUP"
cp "$PROJECT_ROOT/.env" "$CONFIG_BACKUP/.env"
[ -d "$PROJECT_ROOT/certs" ] && cp -r "$PROJECT_ROOT/certs" "$CONFIG_BACKUP/certs"
success "Config backup: $CONFIG_BACKUP"

# ── 3. Uploads backup (full only) ─────────────────────────────────────────────
if $FULL_BACKUP; then
  info "Backing up user-uploaded files..."
  UPLOADS_ARCHIVE="$BACKUP_ROOT/uploads/uploads_${TIMESTAMP}.tar.gz"
  tar -czf "$UPLOADS_ARCHIVE" -C "$PROJECT_ROOT" uploads/ 2>/dev/null || true
  success "Uploads backup: $UPLOADS_ARCHIVE ($(du -sh "$UPLOADS_ARCHIVE" | cut -f1))"
fi

# ── 4. Verify database backup ─────────────────────────────────────────────────
info "Verifying database backup integrity..."
PGPASSWORD="${DB_PASSWORD}" pg_restore --list "$DB_BACKUP_FILE" >/dev/null 2>&1 \
  && success "Database backup integrity: OK" \
  || error "Database backup appears corrupted!"

# ── 5. Rotate old backups ─────────────────────────────────────────────────────
info "Rotating old backups (keeping last 7 days of DB dumps)..."
find "$BACKUP_ROOT/db" -name "*.dump" -mtime +7 -delete
find "$BACKUP_ROOT/config" -mindepth 1 -maxdepth 1 -type d -mtime +7 \
  -exec rm -rf {} + 2>/dev/null || true

if $FULL_BACKUP; then
  find "$BACKUP_ROOT/uploads" -name "*.tar.gz" -mtime +28 -delete
fi
success "Old backups rotated"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${RESET}"
if $FULL_BACKUP; then
  echo -e "${GREEN}  Full backup completed: $TIMESTAMP     ${RESET}"
else
  echo -e "${GREEN}  Incremental backup completed: $TIMESTAMP${RESET}"
fi
echo -e "${GREEN}═══════════════════════════════════════════${RESET}"
echo -e "  DB:     $DB_BACKUP_FILE"
echo -e "  Config: $CONFIG_BACKUP"
$FULL_BACKUP && echo -e "  Files:  $UPLOADS_ARCHIVE"
echo ""
