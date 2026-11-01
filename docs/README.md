# VECTRIX OS Documentation

- Status: index of implemented documentation
- Last updated: 2026-10-26
- Repository root: [PRODUCT.md](../PRODUCT.md), [AGENTS.md](../AGENTS.md)

## Overview
- [Architecture](architecture.md) — System shape, layers, API surface, data flow
- [Data model](data-model.md) — Prisma schema, relations, invariants, units
- [Brand and naming](brand-and-naming.md) — Trademark research, risks, alternatives

## Engineering
- [Electrical methods](electrical-methods.md) — Calculations, formulas, provenance, limits
- [Validation rules](validation-rules.md) — Rule set VX-PT-RES-1.0.0, severities, decisions
- [Routing](architecture.md#3.4) — See electrical methods §7 and ADR-0006

## Decisions (ADRs)
- [ADR-0001 — Monorepo and stack](adr/0001-monorepo-and-stack.md)
- [ADR-0002 — PostgreSQL in production, SQLite in dev](adr/0002-postgres-production-sqlite-dev.md)
- [ADR-0003 — Calculations are advisory](adr/0003-advisory-calculations.md)
- [ADR-0004 — Session auth and capabilities](adr/0004-session-auth-and-capabilities.md)
- [ADR-0005 — Single spatial model](adr/0005-single-spatial-model.md)
- [ADR-0006 — Route lifecycle and decisions](adr/0006-route-lifecycle-and-decisions.md)
- [ADR-0007 — SVG plan renderer](adr/0007-svg-plan-renderer.md)

## APIs
- [PVGIS 5.3](apis/pvgis.md) — In use (legacy)
- [Nominatim (OpenStreetMap)](apis/nominatim.md) — Planned, not approved for commercial
- [Open-Meteo](apis/open-meteo.md) — Planned, restrictions apply
- [Electricity tariffs](apis/tariffs.md) — No API chosen

## Operations and quality
- [Security](security.md) — Auth, authz, CSRF, tenant isolation, gaps
- [Testing](testing.md) — 108 unit + 37 E2E tests, coverage and gaps
- [Accessibility](accessibility.md) — WCAG 2.2 AA partial, contrast and gaps
- [Performance](performance.md) — Observations, no benchmarks
- [Operations](operations.md) — Dev/E2E/prod notes, commands
- [Roadmap](roadmap.md) — Phases and ideas
- [Limitations](limitations.md) — Known gaps and boundaries

## Quick links
- Demo project: `VX-DEMO-001` / `prj_demo-t2`
- Demo users: `engineer@vectrix.pt`, `tech@vectrix.pt` (password `VectrixDemo!2026`)
- Tests: `npm run test`, `npm run test:e2e`
- Build: `npm run build`, `npm run typecheck`
