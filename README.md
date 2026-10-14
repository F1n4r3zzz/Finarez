# Finanz

Personal finance web app: accounts, income and expenses, transfers, budgets, savings, debts and net worth. Spanish first, multi-currency (USD, EUR, COP, MXN). Work in progress.

## Requirements

- Node 24 and pnpm 10
- PostgreSQL 18 with two databases, `finanz_dev` and `finanz_test`, owned by role `finanz`

Arch Linux, everything in one command:

```sh
sudo pacman -S --needed postgresql nodejs-lts-krypton && sudo -iu postgres initdb -D /var/lib/postgres/data --locale=C.UTF-8 --encoding=UTF8 --auth-local=peer --auth-host=scram-sha-256 && sudo systemctl enable --now postgresql && sudo -iu postgres psql -c "CREATE ROLE finanz LOGIN CREATEDB PASSWORD 'finanz_local';" && sudo -iu postgres createdb -O finanz finanz_dev && sudo -iu postgres createdb -O finanz finanz_test
```

The password `finanz_local` is for local development only.

## Setup

```sh
cp .env.example .env
pnpm install
pnpm check        # lint, typecheck, module boundaries, tests (needs the test database)
pnpm dev          # API on http://localhost:3000/api (GET /api/health)
pnpm db:migrate   # apply migrations to DATABASE_URL
```
