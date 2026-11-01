# Nominatim (OpenStreetMap) — address geocoding

| Field | Value |
|---|---|
| Provider | OpenStreetMap Foundation (public instance) |
| Purpose | Turn a project address into coordinates, once, at project setup |
| Programme status | Planned — no client exists |
| Status in this repository | **Not implemented.** No client, route or call. |
| Client location (planned) | `apps/web/src/server/geocoding.ts` (server-only) |
| Verified on | 2026-10-26 |

## Licence and terms

The public `nominatim.openstreetmap.org` service is governed by the Nominatim
Usage Policy, an acceptable-use policy for OSMF-operated servers. Data is
provided under the **Open Database Licence (ODbL)**, which is share-alike.
Attribution is required.

Source: <https://operations.osmfoundation.org/policies/nominatim/>

### Hard requirements from the policy

- Absolute maximum **1 request per second**. This applies to the sum of all
  users of the application, not per user.
- A valid `User-Agent` or `Referer` identifying the application. Default HTTP
  library user agents are not acceptable.
- Clear attribution suitable to the medium.
- Cache results; repeated identical queries may be treated as faulty and blocked.
- The application must be able to switch provider at our request without a
  software update (configure the endpoint, do not hard-code it).
- No autocomplete. No systematic/grid reverse queries. No bulk exports.
- Do not submit personal or confidential data to the public service.
- Commercial applications should assume the public service may change or be
  withdrawn; the policy explicitly warns about relying on it for paying
  customers.

Source for the above: same policy page, sections “Requirements”,
“Websites and Apps”, “Bulk Geocoding” and “Changes to this Policy”.

## Decision for VECTRIX

The public Nominatim instance is **not approved for production commercial use**
as-is. A paid product with many users would exceed the spirit and likely the
letter of the policy. Before implementing:

1. Prefer a **self-hosted Nominatim** instance, or a commercial provider with a
   contract and an SLA.
2. If the public instance is used for a limited pilot, enforce a global
   one-request-per-second queue, a descriptive `User-Agent` including a contact
   URL, permanent caching, visible ODbL attribution, and a kill switch.
3. Keep geocoding behind our own server endpoint so the provider can be swapped
   without shipping a client update.

Until that decision is recorded here, status stays **planned / blocked**.

## Endpoint (public instance, reference only)

```
GET https://nominatim.openstreetmap.org/search?q=<address>&format=jsonv2&limit=1&addressdetails=1
GET https://nominatim.openstreetmap.org/reverse?lat=<lat>&lon=<lon>&format=jsonv2
```

Required/relevant parameters observed in the public documentation:

- `q` — free-form query, or structured `street`, `city`, `country`, …
- `format=jsonv2` — machine-readable output.
- `limit` — cap results; use 1–5, never large.
- `addressdetails=1` — include structured address parts.
- `countrycodes=pt` — restrict to the project's country when known.
- `email` — contact address for heavier use, per policy.

Do not invent parameters beyond the documented set.

## Client requirements (if approved)

- Server-side only. Never expose the provider to the browser.
- Global rate limiter: one in-flight request per second across the process.
  Document that this is per instance, like the existing login limiter.
- Timeout 8 s; at most one retry on network/5xx, never on `429`.
- Zod-validate input (non-empty, length-bounded address) and the response.
- Cache by normalised address + country for at least 30 days.
- Store coordinates and the provider response ID with the project, plus a
  “geocoded at / provider” note, so a later change is auditable.
- Show “© OpenStreetMap contributors” next to any geocoded result.

## Tests required before shipping

- Fixture-based search and reverse responses; no live calls in tests.
- Rate-limit test proving the second immediate call waits.
- Empty result, ambiguous result, timeout and `429` handling.
- Assert attribution is rendered.
- Assert the endpoint is configurable by environment variable.

## Privacy

Addresses are often personal data (a client's home). Sending a full address to a
third party is a data-processing decision that must be documented before
implementation. Prefer sending the minimum (street + postcode + city) and record
it in the privacy notice.

## Open questions

- Self-host or contract a provider? Cost and operations owner are undecided.
- Is geocoding needed in the MVP at all? The current project creation accepts a
  free-text address and does not need coordinates.
