# Roadmap

- Status: planning, **not committed**
- Last updated: 2026-10-26

> Items are ideas or gaps, not promises. Nothing below is scheduled. See
> [limitations.md](limitations.md) for what is currently blocked.

## Phase 0 — Documentation (current)
- [x] Architecture, data model, ADRs
- [x] API docs
- [x] Electrical methods, validation rules
- [x] Security, testing, accessibility
- [x] Brand and naming research
- [ ] Performance, operations, roadmap, limitations, README index (this set)

## Phase 1 — Harden the MVP
- [ ] **Migrations**: create a baseline Prisma migration for PostgreSQL
- [ ] **PostgreSQL**: test against real Postgres, adjust schema if needed
- [ ] **Security headers**: CSP, HSTS, X-Frame-Options, Referrer-Policy,
      Permissions-Policy
- [ ] **Rate limiting**: replace in-memory with shared store; cover mutations
- [ ] **CSV safety**: neutralise spreadsheet formula injection
- [ ] **Focus management**: traps and restoration for modals; skip link
- [ ] **Keyboard geometry**: nudging/placement without pointer

## Phase 2 — Electrical completeness
- [ ] **Standards verification**: licensed IEC 60364-5-52 for Ref C PVC tables
- [ ] **More methods**: additional installation methods with verified tables
- [ ] **XLPE support**: enable when verified data exists
- [ ] **Fault level**: short-circuit, disconnection time, selectivity
- [ ] **RCD coordination**: improved checks
- [ ] **Cable derating edge cases**: more complete tables

## Phase 3 — Workflow and collaboration
- [ ] **Revisions**: use the reserved `Revision` model for snapshots and diffs
- [ ] **Connection authoring**: create/delete connections in the UI/API
- [ ] **Approvals**: four-eyes, signatures, issue lock
- [ ] **Audit UI**: viewer for `AuditEvent`
- [ ] **Bulk actions**: bulk resolve findings

## Phase 4 — Field and broader discipline
- [ ] **Field module**: use `field:*` capabilities properly
- [ ] **Import**: DXF/DWG or structured import
- [ ] **Price book**: only with a licensed source
- [ ] **Other disciplines**: telecom/solar/HVAC/plumbing when needed
- [ ] **3D/AR**: only if clearly separated from drilling guides and with safety
      controls

## Explicitly not planned now
- AI design generation (marker exists only as provenance)
- Public API
- Real-time collaboration
- Payment/billing
