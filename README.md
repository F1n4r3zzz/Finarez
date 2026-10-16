# Finarez

Personal finance web app: accounts, income and expenses, transfers, budgets, savings, debts and net worth. Spanish first, multi-currency (USD, EUR, COP, MXN). Work in progress.

Working today: sign-up and sign-in, accounts, income and expenses, transfers (including between currencies), exchange rates, the home dashboard, debts (loans and credit cards, with each payment split into interest and principal), savings goals and reports. Budgets, recurring movements and file import are next.

## Requirements

- Node 24 and pnpm 10
- PostgreSQL 18 with two databases, `finanz_dev` and `finanz_test`, owned by role `finanz`

## Setup

```sh
cp .env.example .env   # then set AUTH_SECRET to the output of: openssl rand -base64 32
pnpm install
pnpm db:migrate        # create the tables in DATABASE_URL
pnpm check             # lint, typecheck, module boundaries, tests (needs the test database)
pnpm dev               # API on http://localhost:3000/api
pnpm --filter @finanz/web dev   # web app on http://localhost:5173
pnpm e2e               # browser tests of the main flows (auth, accounts and movements, debts) against a fresh test database
```

Locally, sign-up and password-reset emails are printed in the API's terminal. `pnpm e2e` uses the installed Google Chrome; in CI it uses Playwright's Chromium.

## Database logins

Hosted databases use three logins:

- The owner (the provider's default login) runs the migrations at deploy time, from `DATABASE_URL_UNPOOLED`.
- `finanz_app` is the API's login (`DATABASE_URL`). It reads and writes rows but can't change the schema, delete transactions or rewrite the edit history.
- `finanz_backup` reads everything, for the nightly backup.

Create the two logins once per environment, as the owner, with long random passwords:

```sql
create role finanz_app login password '...';
create role finanz_backup login password '...';
```

Every migration run then grants them access to all the app's tables. Locally neither login exists and `finanz` does everything.

## Backups

Every night, `.github/workflows/backup.yml` dumps the hosted database as `finanz_backup` and encrypts the dump with [age](https://age-encryption.org) for the backup key (`scripts/backup-database.sh`). The encrypted file is kept as the workflow's artifact for 30 days, and copied to Cloudflare R2 when the R2 secrets are set. Only the private half of the backup key can decrypt it, and that half is kept offline: never in this repository, GitHub, Vercel or the database provider.

Repository secrets: `BACKUP_DATABASE_URL` (the direct connection, not the pooler, as `finanz_backup`); for R2, also `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.

To restore into an empty database, as its owner:

```sh
age --decrypt -i finanz-backup.agekey finanz-<time>.dump.age \
  | pg_restore --no-owner --no-privileges --exit-on-error --dbname="$OWNER_URL"
MIGRATION_DATABASE_URL="$OWNER_URL" pnpm db:migrate   # grants the logins again
```
