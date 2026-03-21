#!/usr/bin/env bash
# =============================================================================
# MuzaLife Backend — Production Environment Startup Script
#
# Usage:
#   chmod +x docs/scripts/start-prod.sh
#   ./docs/scripts/start-prod.sh
#
# What it does:
#   1. Checks prerequisites (Node.js, PM2, PostgreSQL)
#   2. Verifies .env and SSL certificates
#   3. Installs production-only dependencies
#   4. Starts (or restarts) the app via PM2
#   5. Saves the PM2 process list for reboot persistence
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP_NAME="muzalife-backend"
cd "$PROJECT_ROOT"

info "Project root: $PROJECT_ROOT"

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || error "Node.js is not installed."
command -v pm2  >/dev/null 2>&1 || error "PM2 is not installed. Run: npm install -g pm2"
success "Node.js $(node -v) and PM2 found"

# ── 2. Check .env ─────────────────────────────────────────────────────────────
[ -f ".env" ] || error ".env file not found."
success ".env found"

# ── 3. Check SSL certificates ────────────────────────────────────────────────
[ -f "certs/localhost-key.pem" ] && [ -f "certs/localhost-cert.pem" ] \
  || error "SSL certificates not found in certs/. See deployment.md."
success "SSL certificates found"

# ── 4. Set NODE_ENV ───────────────────────────────────────────────────────────
export NODE_ENV=production
info "NODE_ENV=production"

# ── 5. Install production dependencies ───────────────────────────────────────
info "Installing production dependencies..."
npm ci --omit=dev
success "Dependencies installed"

# ── 6. Start or reload via PM2 ───────────────────────────────────────────────
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  info "Process '$APP_NAME' already exists — reloading (zero downtime)..."
  pm2 reload "$APP_NAME"
else
  info "Starting new PM2 process '$APP_NAME'..."
  pm2 start server.js \
    --name "$APP_NAME" \
    --interpreter node \
    --env production \
    --max-memory-restart 400M \
    --log-date-format "YYYY-MM-DD HH:mm:ss"
fi

# ── 7. Persist PM2 process list ───────────────────────────────────────────────
pm2 save
success "PM2 process list saved (will survive reboots)"

# ── 8. Status summary ────────────────────────────────────────────────────────
echo ""
pm2 status "$APP_NAME"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${RESET}"
echo -e "${GREEN}  MuzaLife Backend started in PROD mode    ${RESET}"
echo -e "${GREEN}═══════════════════════════════════════════${RESET}"

# Quick health check
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*#  ]] && continue
  [[ -z "${line//[[:space:]]/}" ]] && continue
  [[ "$line" =~ ^([^=]+)=(.*)$  ]] || continue
  export "${BASH_REMATCH[1]}"="${BASH_REMATCH[2]}"
done < .env
PORT="${PORT:-5001}"
sleep 2
if curl -sk "https://localhost:${PORT}/api/health" | grep -q "OK"; then
  success "Health check passed — server is responding"
else
  warn "Health check did not return OK. Check logs: pm2 logs $APP_NAME"
fi
