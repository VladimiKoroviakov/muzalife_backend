#!/usr/bin/env bash
# =============================================================================
# MuzaLife Backend — Development Environment Startup Script
#
# Usage:
#   chmod +x docs/scripts/start-dev.sh
#   ./docs/scripts/start-dev.sh
#
# What it does:
#   1. Checks Node.js and PostgreSQL availability
#   2. Verifies .env exists
#   3. Verifies HTTPS certificates exist in certs/
#   4. Checks PostgreSQL connectivity
#   5. Installs npm dependencies if node_modules is missing
#   6. Starts the development server with nodemon
# =============================================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; exit 1; }

# ── Resolve project root ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"
info "Project root: $PROJECT_ROOT"

# ── 1. Check Node.js ──────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || error "Node.js is not installed. Download from https://nodejs.org"
NODE_VER=$(node -v)
info "Node.js version: $NODE_VER"

# ── 2. Check .env ─────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  error ".env file not found. Copy the template from README.md and fill in values."
fi
success ".env found"

# ── 3. Check SSL certificates ────────────────────────────────────────────────
if [ ! -f "certs/localhost-key.pem" ] || [ ! -f "certs/localhost-cert.pem" ]; then
  warn "SSL certificates not found in certs/."
  warn "Generate them with mkcert:"
  warn "  mkcert -cert-file certs/localhost-cert.pem -key-file certs/localhost-key.pem localhost"
  error "Cannot start — SSL certificates are required."
fi
success "SSL certificates found"

# ── 4. Load env vars and check DB ────────────────────────────────────────────
# Safe .env loader — reads values literally, no shell interpretation of $, &, etc.
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*#  ]] && continue   # skip comments
  [[ -z "${line//[[:space:]]/}" ]] && continue    # skip blank lines
  [[ "$line" =~ ^([^=]+)=(.*)$  ]] || continue
  export "${BASH_REMATCH[1]}"="${BASH_REMATCH[2]}"
done < .env

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-muzalife}"

info "Checking PostgreSQL connection ($DB_HOST:$DB_PORT)..."
if command -v pg_isready >/dev/null 2>&1; then
  pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1 \
    || warn "PostgreSQL not ready yet. Make sure it is running."
  success "PostgreSQL is accepting connections"
else
  warn "pg_isready not found. Skipping DB check."
fi

# ── 5. Install dependencies ───────────────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  info "node_modules not found. Running npm install..."
  npm install
fi
success "Dependencies installed"

# ── 6. Start development server ──────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════${RESET}"
echo -e "${GREEN}  Starting MuzaLife Backend (DEV mode)  ${RESET}"
echo -e "${GREEN}════════════════════════════════════════${RESET}"
echo -e "  URL:      https://localhost:${PORT:-5001}"
echo -e "  API docs: https://localhost:${PORT:-5001}/api/docs"
echo -e "  Health:   https://localhost:${PORT:-5001}/api/health"
echo ""

npm run dev
