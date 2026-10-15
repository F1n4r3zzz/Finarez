#!/usr/bin/env bash
# Dumps the hosted database with the read-only finanz_backup login and encrypts the dump for the
# backup key, so whoever stores it can't read it (README, "Backups").
# Needs BACKUP_DATABASE_URL (direct connection, not the pooler), BACKUP_AGE_RECIPIENT, and
# pg_dump of the server's major version or newer, plus age, on PATH.
# Prints the path of the new file: <out-dir>/finanz-<UTC time>.dump.age
set -euo pipefail

out="${1:?usage: backup-database.sh <out-dir>}"
: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is not set}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is not set}"

mkdir -p "$out"
file="$out/finanz-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
trap 'rm -f "$file"' ERR
# The provider's own schemas are left out; the app's schemas, data and migrations journal go in.
pg_dump --format=custom --no-owner --no-privileges --exclude-schema=neon_auth \
  --dbname="$BACKUP_DATABASE_URL" |
  age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" >"$file"
echo "$file"
