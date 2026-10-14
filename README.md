# Finanz

Personal finance web app: accounts, income and expenses, transfers, budgets, savings, debts and net worth. Spanish first, multi-currency (USD, EUR, COP, MXN). Work in progress.

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
pnpm e2e               # browser tests: sign-up to sign-out against a fresh test database
```

Locally, sign-up and password-reset emails are printed in the API's terminal. `pnpm e2e` uses the installed Google Chrome; in CI it uses Playwright's Chromium.
