# MuzaLife Backend — Update Procedure

This document provides step-by-step instructions for updating the MuzaLife Backend in a production environment. It is intended for **release engineers and DevOps engineers**.

---

## Table of Contents

1. [Pre-Update Checklist](#1-pre-update-checklist)
2. [Update Process](#2-update-process)
3. [Post-Update Verification](#3-post-update-verification)
4. [Rollback Procedure](#4-rollback-procedure)

---

## 1. Pre-Update Checklist

### 1.1 Create a Database Backup

Always back up the database before any update. See [`backup.md`](./backup.md) for the full procedure. Quick backup:

```bash
BACKUP_DIR=~/backups/pre-update-$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
pg_dump -U muzalife_user -d muzalife -F c -f "$BACKUP_DIR/muzalife_db.dump"
echo "Backup created: $BACKUP_DIR/muzalife_db.dump"
```

### 1.2 Back Up Configuration Files

```bash
cp ~/muzalife_backend/.env "$BACKUP_DIR/.env.backup"
cp -r ~/muzalife_backend/certs "$BACKUP_DIR/certs"
```

### 1.3 Check Compatibility

Review the release notes / changelog before updating:

- Does the new version add or remove API endpoints?
- Are there new required environment variables?
- Does the update include database schema migrations?

```bash
# Check what changed since the last deployment
cd ~/muzalife_backend
git fetch origin
git log HEAD..origin/main --oneline
```

### 1.4 Notify Stakeholders

If the update requires a service restart (downtime), notify users in advance. For a zero-downtime reload, use `pm2 reload` instead of `pm2 restart` (see step 2.5).

### 1.5 Record Current State

```bash
# Note the current commit hash (for rollback reference)
git rev-parse HEAD
# Example output: a3f7d2e1b9c4...
```

---

## 2. Update Process

### 2.1 Stop Non-Critical Background Jobs *(if applicable)*

If the project has scheduled tasks or queue workers, stop them before deploying to avoid conflicts during migrations.

```bash
pm2 stop muzalife-workers  # if applicable
```

### 2.2 Pull the New Code

```bash
cd ~/muzalife_backend
git fetch origin
git pull origin main
```

### 2.3 Install or Update Dependencies

```bash
npm ci --omit=dev
```

> Use `npm ci` (not `npm install`) in production — it installs exact versions from `package-lock.json`.

### 2.4 Update Environment Variables *(if needed)*

Check the changelog or release notes for new required variables and add them to `.env`:

```bash
nano .env
```

### 2.5 Run Database Migrations *(if schema changed)*

If the new release includes schema changes, apply them **before** restarting the application:

```bash
# If a migration script is provided with the release:
node scripts/migrate.js

# If the release only updates the full schema (initial setup style):
# CAUTION: only run setup-db for brand-new installs or explicitly instructed to
# npm run setup-db
```

> **Warning:** Always test migrations on a staging environment before applying to production.

### 2.6 Restart the Application

**For a brief downtime restart:**
```bash
pm2 restart muzalife-backend
```

**For zero-downtime reload (preferred):**
```bash
pm2 reload muzalife-backend
```

---

## 3. Post-Update Verification

Run these checks immediately after the update:

```bash
# Check the process is running
pm2 status muzalife-backend

# Check for errors in logs
pm2 logs muzalife-backend --lines 100 --nostream

# Health endpoint
curl -k https://localhost:5001/api/health

# Database connectivity
curl -k https://localhost:5001/api/test-db

# Swagger UI still accessible
curl -k -o /dev/null -w "%{http_code}" https://localhost:5001/api/docs
# Expected: 200
```

Also verify:
- All previously working API endpoints still return correct responses.
- No new error-level messages appear in `pm2 logs`.
- The frontend (if updated simultaneously) connects successfully to the backend.

---

## 4. Rollback Procedure

If the update causes critical errors, roll back to the previous version immediately.

### 4.1 Restore the Previous Code

```bash
cd ~/muzalife_backend

# Option A — revert to previous commit
git log --oneline -10          # find the last good commit hash
git checkout <previous-commit-hash>

# Option B — reset to a specific tag/release
git checkout tags/v1.2.3
```

### 4.2 Reinstall Dependencies for the Previous Version

```bash
npm ci --omit=dev
```

### 4.3 Restore Environment Variables *(if changed)*

```bash
cp ~/backups/pre-update-<timestamp>/.env.backup .env
```

### 4.4 Restore Database Backup *(if schema was migrated)*

> **Important:** Only restore the database if the schema was changed and is incompatible with the rolled-back code.

```bash
# Stop the application first
pm2 stop muzalife-backend

# Restore database from backup
pg_restore -U muzalife_user -d muzalife -c -F c ~/backups/pre-update-<timestamp>/muzalife_db.dump

# Restart the application
pm2 start muzalife-backend
```

### 4.5 Verify the Rollback

```bash
pm2 status muzalife-backend
curl -k https://localhost:5001/api/health
pm2 logs muzalife-backend --lines 30 --nostream
```

### 4.6 Post-Rollback Actions

- Notify the team about the rollback and the reason.
- Create a GitHub issue describing the failure.
- Schedule a post-mortem to prevent recurrence.
