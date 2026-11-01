# Security

- Status: implemented MVP controls, **not independently assessed**
- Last verified against the repository: 2026-10-26
- Related decisions: [ADR-0004](adr/0004-session-auth-and-capabilities.md)
- Operations: [operations.md](operations.md)

> There has been no penetration test, threat-model workshop or third-party
> security review. This document describes what the code actually does, not a
> claim that the application is secure.

## 1. Scope and assets

The MVP is a single Next.js Node process with one database. It has no queue,
object store, external API client, file upload, public API or webhook.

Assets:

- user credentials and password hashes;
- session tokens and their hashes;
- project geometry, circuit data, equipment data and material take-off;
- validation decisions and the audit trail;
- organisation membership and roles.

## 2. Authentication

| Control | Implementation |
|---|---|
| Credential | Email + password |
| Password storage | `scrypt$<16-byte hex salt>$<64-byte hex key>` using Node `crypto.scryptSync` |
| Password comparison | `crypto.timingSafeEqual`, length checked first |
| Session identifier | 32 random bytes, base64url, sent as `vectrix_session` |
| Session at rest | SHA-256 of the token; the raw token is never stored |
| Session lifetime | 30 days from creation; expired sessions are deleted on read |
| Cookie flags | `httpOnly`, `SameSite=Lax`, `Secure` when `NODE_ENV=production`, `Path=/` |
| Logout | Deletes the session row and clears the cookie |
| Login rate limit | 10 attempts per 60 s per client key |
| Login error | Generic `INVALID_CREDENTIALS`; does not reveal whether the email exists |
| Email normalisation | Trimmed by Zod, lowercased for lookup |

**Not present:** password policy, password reset, email verification, MFA,
session rotation, “sign out everywhere”, login notifications, login audit
events, account lockout, or a password-change screen. The demo credentials are
published in the seed and documentation; they must never be used in a
production environment.

The scrypt work factor is Node's default (`N=16384, r=8, p=1`). It is not
configurable in this build and has not been benchmarked against a target
attacker cost.

## 3. Session and CSRF model

- The cookie is `SameSite=Lax`, which blocks cross-site cookie attachment on
  cross-site POST/PATCH/DELETE requests in modern browsers.
- Every state-changing handler calls `assertSameOrigin(request)`. If an
  `Origin` header is present, its host must exactly match the `Host` header.
  If the header is absent, the request is allowed — this keeps `curl` and the
  Playwright API client usable.
- There is **no synchroniser CSRF token**. The combination of SameSite and the
  origin check is the whole defence.
- `GET` endpoints have no origin check and must remain free of side effects.

A reverse proxy must preserve the original `Host` and `Origin` semantics. If it
rewrites `Host`, same-origin checks will fail or, worse, become meaningless if
both headers are rewritten inconsistently.

## 4. Authorisation

Roles are stored on `Membership`. The session uses the user's first membership
by creation time; there is no organisation switcher.

| Capability | owner | admin | engineer | technician | viewer |
|---|---|---|---|---|---|
| `project:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `project:write` | ✓ | ✓ | ✓ | — | — |
| `project:delete` | ✓ | — | — | — | — |
| `design:write` | ✓ | ✓ | ✓ | — | — |
| `validation:run` | ✓ | ✓ | ✓ | — | — |
| `validation:resolve` | ✓ | ✓ | ✓ | — | — |
| `estimate:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `field:read` | ✓ | ✓ | ✓ | ✓ | — |
| `field:write` | ✓ | ✓ | ✓ | ✓ | — |
| `org:manage` | ✓ | ✓ | ✓ | — | — |
| `audit:read` | ✓ | ✓ | ✓ | — | — |

Enforcement:

- Project routes call `requireProjectAccess(projectId, capability)`. The
  project lookup is always scoped by the session's `orgId`; a project outside
  the organisation returns **404**, not 403, so its existence is not leaked.
- Routes that are not project-scoped (login, project creation) use
  `requireApiUser` / `requireApiCapability`.
- The UI hides controls the role cannot use, but that is a usability measure.
  The server check is authoritative; the Playwright technician spec proves the
  API refuses mutations even when a request is crafted directly.
- `project:delete`, `field:*`, `org:manage` and `audit:read` exist in the
  capability model but have no endpoint or screen in the MVP.

**Gaps.** There is no four-eyes rule, no per-project membership override, no
IP allow-list, and no separation between “run validation” and “accept risk”
beyond the two capabilities. A user with `validation:resolve` can accept their
own risk.

## 5. Tenant isolation

Every project query is filtered by the session organisation, directly or
through a relation:

- `listProjects(user.orgId)`;
- `requireProjectAccess` for project routes;
- `requireLevel`/`requireCircuit`/`requireEquipment` helpers additionally
  constrain the entity to the project;
- validation decisions are looked up by `(projectId, validationId)`.

There is no client-supplied organisation id anywhere in the request schemas.
The demo seed creates one organisation with two users.

**Gap.** There is no automated cross-tenant test matrix beyond the API spec's
“project outside the organisation returns 404”. A dedicated isolation suite
should be added before multi-customer use.

## 6. Input handling and injection

- All request bodies pass through Zod (`readJson`). Invalid JSON is `400`;
  schema failure is `422` with field issues.
- String lengths, numeric ranges, array lengths, enum values, colours and
  catalogue keys are bounded. Route polylines are capped at 512 points; room
  polygons at 256.
- Unknown keys are stripped by the object schemas; catalogue keys are checked
  against the authored catalogue.
- Prisma is used exclusively; there is **no raw SQL**, string-concatenated query
  or dynamic table name. SQL injection is therefore not a practical path in the
  current code.
- React escapes text content. There is no user-supplied HTML rendering. The
  only `dangerouslySetInnerHTML` is a constant theme bootstrap script in
  `layout.tsx`.
- There is no file upload, archive extraction, path parameter used as a
  filesystem path, or outbound fetch with a user-supplied URL.
- SVG content is generated from typed geometry and fixed glyph components, not
  from imported SVG/HTML.

**Gaps.** There is no explicit request-body size limit at the route-handler
layer. Next.js/Node limits apply, but a large JSON body can still consume memory
up to the platform limit. There is no schema-level limit on some free-text
fields beyond their documented maxima; those maxima are enforced by Zod.

## 7. XSS, headers and browser hardening

Configured:

- `poweredByHeader: false` — removes `X-Powered-By`.
- `Cache-Control: no-store` on JSON and CSV responses.
- `httpOnly` session cookie, so JavaScript cannot read it.
- Theme bootstrap reads only a fixed `light`/`dark` value from localStorage.

Configured (as of Stage 3b security hardening, in middleware.ts + next.config.ts):

- Content-Security-Policy (middleware.ts, per-request nonce):
  - Dev: `default-src 'self'; script-src 'self' 'nonce-{nonce}' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  - Prod: `default-src 'self'; script-src 'self' 'nonce-{nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
- `X-Frame-Options: DENY`;
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `X-Content-Type-Options: nosniff`;
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

CSP details:
- Inline scripts use a per-request nonce (generated in middleware.ts via crypto.randomUUID, base64-encoded, passed via x-nonce header, applied to the theme bootstrap script in layout.tsx). 'unsafe-inline' removed from script-src.
- 'unsafe-eval' is dev-only (needed for Next.js/React dev tooling). Removed entirely in production builds.
- Inline styles still use 'unsafe-inline' on style-src (remaining gap — removing requires refactoring all inline styles to CSS classes or a CSS-in-JS nonce approach).

Not configured (remaining gaps):

- CSP nonce for inline styles (currently uses 'unsafe-inline' on style-src);
- Cross-Origin-Opener-Policy / Cross-Origin-Resource-Policy.

## 8. CSV export

`GET /takeoff?format=csv` returns `text/csv` with a filename derived from the
project code. Fields are quoted when they contain commas, quotes or newlines,
and embedded quotes are doubled.

**Known gap — formula injection.** A value beginning with `=`, `+`, `-`, `@`,
tab or carriage return is not prefixed or neutralised. Project names, client
names, circuit names and notes are user-controlled, so a malicious project name
could become a formula when opened in a spreadsheet. Treat exported CSV as
untrusted and add a formula-prefix mitigation before external distribution.

## 9. Rate limiting and denial of service

Only `POST /api/auth/login` is rate-limited: 10 attempts per 60 seconds per
`clientKey`, where the key is the first `x-forwarded-for` value or `local`.

Limitations:

- The bucket map is in-process and unbounded; it is not shared across
  instances and is lost on restart.
- `x-forwarded-for` is trusted as supplied. Behind a proxy, the proxy must strip
  client-supplied values; otherwise an attacker can rotate the header to bypass
  the limit.
- There is no limit on authenticated mutations, validation runs, routing
  requests or CSV exports. The route engine has an internal 120,000-cell guard
  and a minimum 50 mm grid, which bounds a single auto-route request.
- There is no account lockout, CAPTCHA or progressive delay.

Before horizontal scaling, replace this with a shared limiter (for example
Redis) and apply per-user and per-IP budgets to mutations.

## 10. Secrets and configuration

- The only required runtime secret is `DATABASE_URL`.
- `.env` is gitignored; `.env.example` contains only local defaults.
- `NEXT_PUBLIC_APP_URL` is declared but **not used** by any code; it is reserved
  for future printed QR labels.
- No API key, mail credential, object-store key or signing secret exists.
- The demo password is intentionally public. Production must provision users
  with unique credentials and remove or rotate the demo accounts.
- There is no secret manager integration; deployment must inject
  `DATABASE_URL` through the platform.

## 11. Logging, audit and error disclosure

- `apiRoute()` logs unexpected errors with `console.error("api.unhandled", …)`
  and returns a generic `500` with no stack trace or database detail.
- `ApiError` messages are intentionally user-facing and may include entity
  names and limits. They do not include SQL, file paths or secrets.
- Mutations write an `AuditEvent` in the same transaction as the change, with
  actor, action, entity type/id and a JSON payload.
- There are no audit events for login, logout, failed login, session expiry or
  read access, and no UI to inspect audits (`audit:read` has no endpoint).
- Logs are process stdout; there is no retention policy, SIEM export or
  tamper-evident store.

## 12. Data protection

- SQLite stores the database as a plaintext file. Production PostgreSQL is a
  target, not a verified deployment.
- No field-level encryption, at-rest encryption, backup encryption or key
  rotation is implemented by the application.
- Session tokens are hashed; passwords are salted and hashed.
- Deleting a project cascades to its design data and audits at the database
  level. There is no soft delete or retention window, so accidental deletion is
  irreversible without a backup.
- The application has no privacy policy, cookie banner, data-export or
  right-to-erasure workflow. Those are product/legal deliverables, not
  implemented features.

## 13. Supply chain

- `package-lock.json` is present, so installs are reproducible.
- Runtime dependencies are pinned to exact versions for Next.js, React, Prisma
  and Zod; some UI utilities use caret ranges.
- There is no automated dependency scanning, SBOM, signed build or provenance
  attestation in the repository.
- `npm audit` has not been run as part of the documented verification.
- Fonts are bundled locally; there is no CDN script.

## 14. Verification performed

- `apps/web/e2e/auth.spec.ts` — anonymous redirect, wrong-password message,
  cookie flags, API protection and the same-origin guard.
- `apps/web/e2e/technician.spec.ts` — a technician can read but cannot mutate,
  validate or create projects through the API, and sees read-only UI.
- `apps/web/e2e/api.spec.ts` — 404 for a project outside the organisation,
  invalid payload rejection, duplicate code conflict, unknown-level 404.
- Code review of every route handler for capability checks and organisation
  scoping (2026-10-26).

Not performed: penetration test, fuzzing, SAST/DAST, dependency audit,
cross-tenant matrix, load test, backup restore drill.

## 15. Priority actions before production

1. Add CSP and the missing security headers; verify under a real HTTPS proxy.
2. Replace in-memory rate limiting with a shared limiter and cover mutations.
3. Add a cross-tenant API isolation suite.
4. Neutralise spreadsheet formula prefixes in CSV export.
5. Add login/logout/failed-login audit events and an audit viewer.
6. Add password reset, a password policy and session revocation.
7. Run dependency scanning and a third-party security review.
8. Encrypt backups and document retention/deletion.
