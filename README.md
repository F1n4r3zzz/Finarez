# Finanz

Personal finance web app: accounts, income and expenses, transfers, budgets, savings, debts and net worth. Spanish first, multi-currency (USD, EUR, COP, MXN). Work in progress.

## Requirements

- Node 24 and pnpm 10
- PostgreSQL 18 with two databases, `finanz_dev` and `finanz_test`, owned by role `finanz`

## Setup

```sh
cp .env.example .env
pnpm install
pnpm check        # lint, typecheck, module boundaries, tests (needs the test database)
pnpm dev          # API on http://localhost:3000/api (GET /api/health)
pnpm db:migrate   # apply migrations to DATABASE_URL
```
