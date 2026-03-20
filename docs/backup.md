# MuzaLife Backend — Backup & Restore Procedures

This document describes the backup strategy, procedures, and restoration steps for the MuzaLife Backend. It is intended for **release engineers and DevOps engineers**.

---

## Table of Contents

1. [Backup Strategy](#1-backup-strategy)
2. [Backup Procedures](#2-backup-procedures)
3. [Backup Integrity Verification](#3-backup-integrity-verification)
4. [Automated Backup](#4-automated-backup)
5. [Restoration Procedures](#5-restoration-procedures)

---

## 1. Backup Strategy

### 1.1 What Needs to Be Backed Up

| Component | Description | Priority |
|---|---|---|
| **PostgreSQL Database** | All business data (users, products, orders, reviews, polls) | Critical |
| **Configuration files** | `.env`, SSL certificates in `certs/` | Critical |
| **User-uploaded files** | Files in `uploads/` (product files, profile images) | High |
| **Application code** | Managed by Git — recoverable from GitHub at any time | Low |
| **System logs** | PM2 logs in `~/.pm2/logs/` | Low |

### 1.2 Backup Types

| Type | Description | Frequency |
|---|---|---|
| **Full backup** | Complete database dump + all user files + config | Weekly (Sunday 02:00) |
| **Incremental backup** | Database dump only (config rarely changes) | Daily (03:00) |

### 1.3 Retention Policy

| Backup Type | Retention Period |
|---|---|
| Daily database dumps | 7 days |
| Weekly full backups | 4 weeks |
| Monthly archives | 6 months |

### 1.4 Storage Location

Store backups in **at least two locations**:
- **Local:** `/var/backups/muzalife/` on the production server
- **Remote:** External storage (S3, Google Drive, SFTP, etc.)

---

## 2. Backup Procedures

### 2.1 Database Backup

Use `pg_dump` with the **custom format** (`-F c`) for maximum flexibility (supports selective restore):

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/muzalife/db"
mkdir -p "$BACKUP_DIR"

pg_dump \
  -U muzalife_user \
  -h localhost \
  -d muzalife \
  -F c \
  -f "$BACKUP_DIR/muzalife_${TIMESTAMP}.dump"

echo "Database backup created: $BACKUP_DIR/muzalife_${TIMESTAMP}.dump"
```

For a plain SQL backup (easier to inspect):
```bash
pg_dump -U muzalife_user -d muzalife > "$BACKUP_DIR/muzalife_${TIMESTAMP}.sql"
gzip "$BACKUP_DIR/muzalife_${TIMESTAMP}.sql"
```

### 2.2 Configuration Backup

```bash
CONFIG_BACKUP="/var/backups/muzalife/config/$TIMESTAMP"
mkdir -p "$CONFIG_BACKUP"

cp ~/muzalife_backend/.env "$CONFIG_BACKUP/.env"
cp -r ~/muzalife_backend/certs "$CONFIG_BACKUP/certs"

echo "Config backed up to: $CONFIG_BACKUP"
```

### 2.3 User-Uploaded Files Backup

```bash
FILES_BACKUP="/var/backups/muzalife/uploads/$TIMESTAMP"
mkdir -p "$FILES_BACKUP"

rsync -av --progress ~/muzalife_backend/uploads/ "$FILES_BACKUP/"
# Or using tar:
tar -czf "/var/backups/muzalife/uploads/uploads_${TIMESTAMP}.tar.gz" \
  -C ~/muzalife_backend uploads/

echo "Uploads backed up to: $FILES_BACKUP"
```

### 2.4 System Logs Backup

```bash
LOGS_DIR="/var/backups/muzalife/logs/$TIMESTAMP"
mkdir -p "$LOGS_DIR"

cp ~/.pm2/logs/muzalife-backend-out.log "$LOGS_DIR/" 2>/dev/null || true
cp ~/.pm2/logs/muzalife-backend-error.log "$LOGS_DIR/" 2>/dev/null || true
gzip "$LOGS_DIR/"*.log 2>/dev/null || true
```

---

## 3. Backup Integrity Verification

After creating a backup, always verify it can be restored:

### 3.1 Verify Database Dump

```bash
# List contents without restoring
pg_restore --list "$BACKUP_DIR/muzalife_${TIMESTAMP}.dump" | head -30

# Test restore to a temporary database
psql -U postgres -c "CREATE DATABASE muzalife_verify;"
pg_restore -U muzalife_user -d muzalife_verify -F c "$BACKUP_DIR/muzalife_${TIMESTAMP}.dump"
psql -U muzalife_user -d muzalife_verify -c "SELECT COUNT(*) FROM users;"
# Clean up after verification
psql -U postgres -c "DROP DATABASE muzalife_verify;"

echo "Backup integrity verified"
```

### 3.2 Verify Uploaded Files Archive

```bash
tar -tzf "/var/backups/muzalife/uploads/uploads_${TIMESTAMP}.tar.gz" | wc -l
# Compare with: find ~/muzalife_backend/uploads -type f | wc -l
```

---

## 4. Automated Backup

### 4.1 Full Backup Script

Save as `/var/backups/muzalife/scripts/backup-full.sh`:

```bash
cat docs/scripts/backup.sh
```

See [`docs/scripts/backup.sh`](./scripts/backup.sh) for the complete automated backup script.

### 4.2 Schedule with Cron

```bash
crontab -e
```

Add the following lines:
```cron
# Daily incremental DB backup at 03:00
0 3 * * * /var/backups/muzalife/scripts/backup-full.sh >> /var/log/muzalife-backup.log 2>&1

# Weekly full backup on Sunday at 02:00
0 2 * * 0 /var/backups/muzalife/scripts/backup-full.sh --full >> /var/log/muzalife-backup.log 2>&1
```

Verify the cron job is registered:
```bash
crontab -l
```

---

## 5. Restoration Procedures

### 5.1 Full System Restoration

Use this procedure to restore the entire system from a full backup.

**Step 1 — Stop the application:**
```bash
pm2 stop muzalife-backend
```

**Step 2 — Restore the database:**
```bash
# Drop and recreate the database
psql -U postgres -c "DROP DATABASE IF EXISTS muzalife;"
psql -U postgres -c "CREATE DATABASE muzalife OWNER muzalife_user;"

# Restore from dump
pg_restore -U muzalife_user -d muzalife -F c \
  /var/backups/muzalife/db/muzalife_<TIMESTAMP>.dump

echo "Database restored"
```

**Step 3 — Restore configuration:**
```bash
cp /var/backups/muzalife/config/<TIMESTAMP>/.env ~/muzalife_backend/.env
cp -r /var/backups/muzalife/config/<TIMESTAMP>/certs ~/muzalife_backend/certs
```

**Step 4 — Restore uploaded files:**
```bash
rsync -av /var/backups/muzalife/uploads/<TIMESTAMP>/ ~/muzalife_backend/uploads/
# Or from tar:
tar -xzf /var/backups/muzalife/uploads/uploads_<TIMESTAMP>.tar.gz \
  -C ~/muzalife_backend
```

**Step 5 — Restart the application:**
```bash
pm2 start muzalife-backend
pm2 status muzalife-backend
curl -k https://localhost:5001/api/health
```

---

### 5.2 Selective Data Restoration

Restore only specific tables (e.g., `users` table only):

```bash
# Restore only the users table
pg_restore -U muzalife_user -d muzalife -F c \
  --table=users \
  /var/backups/muzalife/db/muzalife_<TIMESTAMP>.dump
```

### 5.3 Restoration Testing

Periodically test restoration on a staging environment (at minimum once per month):

```bash
# On a staging server:
pg_restore -U muzalife_user -d muzalife_staging -F c \
  /var/backups/muzalife/db/muzalife_<TIMESTAMP>.dump

# Verify row counts match
psql -U muzalife_user -d muzalife_staging \
  -c "SELECT 'users' AS tbl, COUNT(*) FROM users
      UNION ALL SELECT 'products', COUNT(*) FROM products
      UNION ALL SELECT 'reviews', COUNT(*) FROM reviews;"
```
