# Operations

- Status: local/dev/E2E only, **not production-hardened**
- Last verified: 2026-10-26
- Related: [architecture.md](architecture.md), [security.md](security.md),
  [ADR-0002](adr/0002-postgres-production-sqlite-dev.md)

## 1. Environments

| Environment | Database | Server | Notes |
|---|---|---|---|
| Local dev | `apps/web/prisma/dev.db` (SQLite) | `npm run dev` on 3000 | Reset with `npm run db:reset` |
| E2E | `apps/web/prisma/e2e.db` (SQLite) | Playwright webServer on 3100 | Reset/push/seed before each run |
| Production | PostgreSQL (target) | `npm run build && npm run start` | **Not deployed or tested** |

## 2. Prerequisites

- Node.js ≥ 20.9
- npm (workspaces)
- No Docker required

## 3. Setup

```bash
npm install
npm run db:push        # create/update schema
npm run db:seed        # load demo data
npm run dev            # start http://localhost:3000
```

Demo users: `engineer@vectrix.pt` / `tech@vectrix.pt`, password `VectrixDemo!2026`.

## 4. Database commands

```bash
npm run db:push        # schema sync (no migration files)
npm run db:reset       # force reset + seed
npm run db:seed        # seed only
npm run db:migrate     # prisma migrate dev (no migrations exist yet)
```

There is **no `prisma/migrations/` directory**. Production PostgreSQL requires
a reviewed baseline migration and a migration strategy before deployment.

## 5. Build and quality checks

```bash
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm run start
```

All four pass in this environment at the time of writing.

## 6. Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | see `.env.example` | Prisma connection string |
| `NODE_ENV` | no | `development` | Affects cookie `Secure` flag |
| `NEXT_TELEMETRY_DISABLED` | no | unset | Set by Playwright; not required |
| `NEXT_PUBLIC_APP_URL` | no | unused | Reserved, not read by code |

Only `DATABASE_URL` is required. See `apps/web/.env.example`.

## 7. Deployment notes

- Next.js standalone is not configured; use `next start`.
- SQLite is not suitable for multi-instance or high-concurrency production
  deployments.
- A reverse proxy (TLS terminator) must forward `Host` and `Origin` correctly
  for same-origin checks to work.
- Set security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy,
  Permissions-Policy) at the proxy or application layer.
- Back up the SQLite file if used in a non-disposable environment, but
  SQLite is not recommended for production.
- No health check endpoint, no metrics endpoint, no logging pipeline.

## 8. Monitoring and observability

None implemented. Logs go to stdout via `console.error`. There are no alerts,
traces or structured logs.

## 9. Recovery

- **Schema drift:** `prisma db push` syncs without migrations.
- **Corrupted dev DB:** `npm run db:reset`.
- **Expired sessions:** pruned opportunistically on login and ignored if expired
  on read.
- **Stuck routes/findings:** use the workspace UI or API with the correct role.

## 10. Known operational gaps

- No migration history
- No PostgreSQL deployment tested
- No backup/restore procedure
- No rolling deployment support
- No secrets rotation
- No incident response plan
- No uptime monitoring
