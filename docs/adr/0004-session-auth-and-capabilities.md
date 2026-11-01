# ADR-0004 — Opaque session cookies and server-enforced capabilities

- Status: Accepted, with documented MVP limits
- Date: 2026-10-26

## Context

The workspace contains commercially sensitive design data and state-changing
operations (issue routes, accept risks, change circuits). The MVP needs
authentication and authorisation without introducing an identity provider,
OAuth server, or external session store. It also needs one authorisation model
shared by the API and the UI so the interface cannot drift from the server.

## Decision

### Authentication

1. Passwords are hashed with **scrypt** (`N`/`r`/`p` defaults from Node,
   16-byte random salt, 64-byte derived key) and stored as
   `scrypt$<salt>$<hex>`. Verification uses `timingSafeEqual`.
2. A successful login creates a **32-byte random opaque token**
   (`randomBytes(32).toString("base64url")`), returned once to the browser.
3. Only a **SHA-256 hash** of the token is stored (`Session.tokenHash`). A
   database leak does not yield usable session tokens.
4. The token lives in the `vectrix_session` cookie with
   `httpOnly`, `SameSite=Lax`, `path=/`, 30-day expiry, and `Secure` when
   `NODE_ENV=production`.
5. `getSessionUser()` is memoised with React `cache()` so a layout and its page
   do not perform duplicate session reads in one request.
6. Expired sessions are deleted opportunistically after login.

### Authorisation

Capabilities are declared once in `packages/core/src/permissions.ts`:

| Capability | owner | admin | engineer | technician | viewer |
|---|---|---|---|---|---|
| `project:read` | yes | yes | yes | yes | yes |
| `project:write` | yes | yes | yes | — | — |
| `project:delete` | yes | — | — | — | — |
| `design:write` | yes | yes | yes | — | — |
| `validation:run` | yes | yes | yes | — | — |
| `validation:resolve` | yes | yes | yes | — | — |
| `estimate:read` | yes | yes | yes | yes | yes |
| `field:read` | yes | yes | yes | yes | — |
| `field:write` | yes | yes | yes | yes | — |
| `org:manage` | yes | yes | — | — | — |
| `audit:read` | yes | yes | yes | — | — |

The server is authoritative:

- Project-scoped routes call `requireProjectAccess(projectId, capability)`.
- Non-project routes (for example project creation) call
  `requireApiCapability(user, capability)`.
- Organisation scope is derived from the session, never from a client-supplied
  `orgId`. A project outside the session organisation returns **404**, not 403,
  so its existence is not leaked.

The UI uses the same `can()` function to hide or disable controls and to show a
read-only chip. Disabling a button is presentation only; every mutation is
re-checked server-side.

### Cross-site request protection

State-changing requests pass `assertSameOrigin()`. If an `Origin` header is
present it must match the request `Host`. Non-browser clients may omit it.
`SameSite=Lax` remains the primary control; the origin check is defence in
depth.

### Login throttling

`rateLimit()` allows 10 login attempts per IP per minute using an in-process
`Map`. This is explicitly a **single-instance** control: behind more than one
process or instance, the effective limit multiplies.

## Consequences

- No external identity dependency; the app runs with only Node and the database.
- Session revocation is per-token deletion, not global. There is no “sign out
  everywhere”.
- The capability matrix is small enough to review and test directly.
- Technicians keep read access, estimate access and CSV export, but cannot
  mutate design data or decide findings.
- The login limiter must be replaced with a shared store before horizontal
  scaling. This is recorded in `docs/security.md` and
  `docs/limitations.md`.

## Known gaps

- No multi-factor authentication, password reset, email verification, session
  rotation on privilege change, or device/session list.
- `getSessionUser()` selects the user's **first membership** ordered by
  `createdAt`. A user in several organisations cannot switch organisation in the
  UI. This is acceptable for the single-organisation demo and must be designed
  before multi-tenant launch.
- No account lockout beyond the per-IP rate limit; a distributed attack against
  one account is not mitigated.
- No CSRF token. The chosen controls are SameSite=Lax plus an origin check.

## Alternatives considered

- **JWT in localStorage** — rejected: XSS exposure and no server-side
  revocation.
- **JWT in httpOnly cookie** — workable, but revocation and “sign out” require a
  denylist; opaque server sessions are simpler here.
- **NextAuth/Auth.js** — adds a dependency and configuration surface before the
  product has an identity provider decision.
- **Role checks embedded only in UI** — rejected: hiding a button is not
  authorisation.

## Verification

- `packages/core/test/core.test.ts` covers identifier and domain contracts.
- `apps/web/test/request-schemas.test.ts` covers login input trimming and
  password requirements.
- `apps/web/e2e/auth.spec.ts` asserts anonymous redirect, generic credential
  failure, httpOnly cookie creation, and API/same-origin protection.
- `apps/web/e2e/technician.spec.ts` asserts read access and refused mutations at
  both API and UI level.
- `apps/web/e2e/api.spec.ts` covers 404 for out-of-organisation projects.
