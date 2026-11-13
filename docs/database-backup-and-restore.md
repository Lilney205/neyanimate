# NEY ANIMATE — Database Backup and Disaster Recovery Procedure

This document provides operational guidelines for backing up and restoring the NEY ANIMATE PostgreSQL database.

## 1. Safety Principles

* **Never overwrite production directly**: Always restore backups to a separate, isolated test database instance (e.g. `ney_animate_restore_test`) to verify schema integrity and row counts before considering a database switch.
* **Never hardcode credentials**: Always read database credentials from environment variables (`PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PGPASSWORD`) or a secure secret manager.
* **Pre-deployment snapshots**: Always take a verified backup immediately before applying schema migrations or major application updates.

---

## 2. Backup Schedule Recommendation

| Environment | Frequency | Retention | Type |
| :--- | :--- | :--- | :--- |
| **Production** | Hourly WAL archiving + Daily full snapshot | 30 days point-in-time recovery (PITR) + 90 days daily snapshots | Managed Cloud SQL / RDS automated snapshot + Logical `pg_dump` |
| **Staging** | Daily snapshot | 7 days | Automated snapshot |
| **Pre-Release** | Immediate manual snapshot before `prisma migrate deploy` | Preserved until release verification is complete | Logical `pg_dump` (custom archive format) |

---

## 3. Creating a Database Backup

### Logical Backup with `pg_dump` (Recommended for portability)

Use the PostgreSQL custom binary format (`-F c`), which enables multi-threaded restoration, compression, and selective table recovery.

#### Linux / macOS / Bash:
```bash
# Export connection parameters securely
export PGHOST="localhost"
export PGPORT="5432"
export PGUSER="postgres"
export PGDATABASE="ney_animate"

# Generate timestamped backup file
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="ney_animate_backup_${TIMESTAMP}.dump"

pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -F c -b -v -f "$BACKUP_FILE"
```

#### Windows PowerShell:
```powershell
# Set environment variables
$env:PGHOST = "localhost"
$env:PGPORT = "5432"
$env:PGUSER = "postgres"
$env:PGDATABASE = "ney_animate"

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "ney_animate_backup_$timestamp.dump"

pg_dump -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d $env:PGDATABASE -F c -b -v -f $backupFile
```

---

## 4. Restoring to a Separate Verification Database

To ensure backup viability without risking live data, always restore into a dedicated test database:

### Step 1: Create a separate test database
```sql
CREATE DATABASE ney_animate_restore_test;
```

### Step 2: Restore the dump into the test database
```bash
# Linux / macOS
pg_restore -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d ney_animate_restore_test --clean --if-exists -v "$BACKUP_FILE"

# Windows PowerShell
pg_restore -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d ney_animate_restore_test --clean --if-exists -v $backupFile
```

---

## 5. Verifying Restored Data Integrity

Run verification queries against `ney_animate_restore_test` to confirm critical entities and row counts match expectations:

```sql
-- Connect to the restored database
\c ney_animate_restore_test

-- 1. Check table existence
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;

-- 2. Verify record counts
SELECT 'User' AS entity, COUNT(*) FROM "User"
UNION ALL
SELECT 'Film', COUNT(*) FROM "Film"
UNION ALL
SELECT 'VideoAsset', COUNT(*) FROM "VideoAsset"
UNION ALL
SELECT 'AuditLog', COUNT(*) FROM "AuditLog"
UNION ALL
SELECT '_prisma_migrations', COUNT(*) FROM "_prisma_migrations";

-- 3. Verify latest applied migration
SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 5;
```

---

## 6. Migration Rollback and Forward-Recovery Strategy

When a schema migration encounters an unexpected error in production:

### Forward-Recovery (Preferred)
In modern relational databases and continuous-delivery architectures, **forward-recovery** is preferred over destructive rollbacks:
1. Identify the specific constraint or statement failure.
2. Author an additive, non-breaking forward migration (e.g. `2026xxxxxx_fix_constraint.sql`).
3. Test against the staging/disposable database.
4. Deploy using `npm run prisma:migrate` (or `npx prisma migrate deploy`).

### Rollback Strategy (Emergency Fallback)
If an unrecoverable failure occurs during a planned maintenance window:
1. Immediately switch the application to maintenance mode (HTTP 503).
2. Restore the pre-migration snapshot into a fresh database instance (`ney_animate_standby`).
3. Verify table counts and integrity using the queries in Section 5.
4. Update the application's `DATABASE_URL` environment variable to point to the restored database.
5. Restart the application instances.
6. Investigate the failed migration in an isolated environment.
