# Limitations

- Status: known limitations
- Last updated: 2026-10-26

## 1. Legal and compliance
- **Not compliant.** Passing validation does not mean the design complies with
  IEC 60364, Portuguese regulations or any other standard.
- **Unverified calculations.** PVC Ref C ampacity and some factors are
  indicative, not verified against a licensed standard.
- **No approval workflow.** No signatures, no four-eyes check, no issue lock.
- **Brand unverified.** VECTRIX is provisional; trademark availability not
  confirmed. See [brand-and-naming.md](brand-and-naming.md).

## 2. Electrical scope
- **PVC copper only.** XLPE and other insulation/methods are rejected or warned
  about.
- **Reference method C only.** No other installation methods.
- **Sections 1.5–300 mm².** No interpolation for unlisted sections.
- **No fault level.** Short-circuit, disconnection time, selectivity, thermal
  withstand not checked.
- **Voltage drop scope.** Only circuit conductor drop on longest route; upstream
  losses not included.
- **Load assumptions.** Three-phase unassigned load split equally; demand
  factors are manual.

## 3. Data and workflow
- **No connection authoring.** Terminals and connections are read-only; only
  seeded data exists.
- **No revisions.** `Revision` model unused.
- **No imports.** No DWG/IFC/PDF import.
- **No price book.** Take-off has quantities and basis only, no prices.
- **Routes terminal.** `installed` routes cannot be edited back to previous
  states.
- **SQLite only in practice.** PostgreSQL target untested.

## 4. Security and infrastructure
- **No migrations.** Using `prisma db push`.
- **In-memory rate limiting.** Single-instance only.
- **Security headers.** CSP (nonce-based for scripts, dev-only unsafe-eval), HSTS, X-Frame-Options, Referrer-Policy, X-Content-Type-Options, and Permissions-Policy are now configured site-wide (as of Stage 3b security hardening). CSP generated per-request in middleware.ts. Remaining gaps: inline styles still use 'unsafe-inline' on style-src; HSTS relies on TLS terminator in production; COOP/CORP not set.
- **CSV injection.** Not neutralised.
- **No audit UI.** Audit events written but not viewable.
- **Demo credentials.** Published; must not be used in production.

## 5. UI and accessibility
- **No keyboard geometry.** Pointer required for drawing/moving.
- **Focus management gaps.** No traps/restoration in some modals.
- **No screen-reader audit.** Partial checks only.
- **No RTL.** Planned but not implemented.
- **Plan not a `<main>`.** Landmark structure incomplete.

## 6. Testing
- **No migration test.**
- **No import/export round-trip.**
- **No performance benchmarks.**
- **No security scan (SAST/DAST).**
- **No cross-tenant matrix.**
- **Component tests missing.** Only schema/helper and package tests.

## 7. External dependencies
- **Nominatim/Open-Meteo not approved for commercial production.**
- **Tariffs:** no API chosen.
- **No external API clients in repo.** Only internal `/api` calls.

These limitations are intentional for the MVP or are genuine gaps. They are
documented here to prevent over-claiming.
