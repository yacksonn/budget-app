# Budget App

A personal, Monarch-style budgeting app powered by [Plaid](https://plaid.com). Runs
locally with a file-based SQLite database. Built with Next.js, Prisma, Tailwind, and Recharts.

## Features

- **Plaid integration** — connect banks via Plaid Link, incremental transaction sync.
- **Categories** — a Monarch-like preset category tree, plus your own custom categories/subcategories.
- **Transactions** — searchable/filterable feed, inline re-categorization, **notes per transaction**, "reviewed" flag.
- **Monthly budgets** — per-category-group targets with actual-vs-budget progress bars and "left to budget".
- **Dashboard** — income vs spending, net cash flow, spending-by-category donut, 6-month trend, recent transactions.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Add Plaid sandbox credentials

Get free keys at [dashboard.plaid.com](https://dashboard.plaid.com/) → **Developers → Keys**.
Copy `.env.example` to `.env` (already created) and fill in:

```
PLAID_CLIENT_ID="your_client_id"
PLAID_SECRET="your_sandbox_secret"
PLAID_ENV="sandbox"
```

### 3. Create and seed the database

```bash
npm run db:push   # creates prisma/dev.db from the schema
npm run db:seed   # loads the preset category tree
```

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000. Go to **Accounts → Connect account**. In Plaid sandbox,
choose any institution and log in with:

- Username: `user_good`
- Password: `pass_good`

Then click **Sync now** to pull transactions.

## Useful commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run db:push` | Apply the Prisma schema to the DB |
| `npm run db:seed` | Seed preset categories |
| `npm run db:reset` | Wipe and re-seed the database |

## Going multi-user / synced later

The app is single-account and local by design. To sync data between two people:

1. Change the `datasource` provider in `prisma/schema.prisma` from `sqlite` to `postgresql`.
2. Point `DATABASE_URL` at a hosted Postgres (e.g. Neon or Supabase free tier).
3. Run `npm run db:push && npm run db:seed`, then deploy (e.g. to Vercel).

Because everything goes through Prisma and API routes, no query code needs to change.
Add a shared password gate before exposing it on the public internet.
