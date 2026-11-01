# Open-Meteo — weather and irradiance context

| Field | Value |
|---|---|
| Provider | OpenMeteo GmbH (Switzerland) |
| Purpose | Weather, temperature and irradiance context for a site |
| Programme status | Planned — no client exists |
| Status in this repository | **Not implemented.** No client, route or call. |
| Client location (planned) | `apps/web/src/lib/apis/open-meteo.ts` (server-only) |
| Verified on | 2026-10-26 |

## Licence and terms

Data is offered under **CC BY 4.0**. Commercial use is **not** permitted on the
free API. The provider defines commercial use to include any app with a
subscription or advertising, and commercial products generally. A paid API
subscription is required for commercial use. Free-tier limits are fewer than
10,000 calls/day, 5,000/hour and 600/minute; paid tiers raise or remove them.
Rate limits are applied per IP and application.

Sources:

- <https://open-meteo.com/en/terms>
- <https://open-meteo.com/en/licence>

Consequences for VECTRIX:

- CC BY 4.0 requires attribution. Display “Weather data by Open-Meteo.com
  (CC BY 4.0)” wherever derived values appear.
- A commercial VECTRIX product **cannot** ship on the free tier. A paid plan or
  a self-hosted Open-Meteo deployment is required before implementation.
- Until that commercial decision is made, status is **planned / blocked**.

## Endpoint (documented contract)

```
GET https://api.open-meteo.com/v1/forecast
```

Documented parameters relevant to this product:

- `latitude`, `longitude` — WGS84 degrees, required.
- `hourly` — comma-separated variable list, e.g.
  `temperature_2m,relative_humidity_2m,shortwave_radiation`.
- `daily` — comma-separated daily aggregates; requires `timezone`.
- `current` — current conditions.
- `timezone` — time-zone database name, or `auto`.
- `forecast_days` — 0–16, default 7.
- `past_days` — 0–92.
- `start_date`, `end_date` — `yyyy-mm-dd`.
- `temperature_unit`, `wind_speed_unit`, `precipitation_unit`.
- `apikey` — commercial only; commercial requests use a `customer-` host prefix.

Errors return HTTP 400 with `{ "error": true, "reason": "…" }`.

Source: <https://open-meteo.com/en/docs>

Do not assume undocumented variables or parameters.

## Client requirements (if approved)

- Server-side only.
- Commercial plan or self-hosted instance confirmed in writing before launch.
- Zod-validate query and response; reject unknown shape.
- Timeout 8 s; at most two retries on network/`5xx`, honour `Retry-After`.
- Cache by rounded coordinate and variable set. Weather context for a design is
  not real-time-critical: 1–6 hours is appropriate.
- Request the minimum variables. Do not request 15-minutely data for a design
  snapshot.
- Store the retrieval time, coordinate and model/endpoint with any saved value.
- Surface provider errors as typed, non-blocking context. Weather must never
  block a design operation.

## Why it might be used

Possible future uses: ambient design temperature context, solar exposure notes,
and a warning that a design assumes a climate range. It must not silently change
cable ampacity or voltage-drop calculations: those use explicit, cited
installation conditions chosen by the engineer.

## Tests required before shipping

- Fixture-based forecast response; no live calls in tests.
- Timeout, `400`, `429` and malformed-response cases.
- Cache test proving a repeated request performs no network call.
- Assert CC BY attribution is rendered.

## Open questions

- Is weather context in scope for the electrical MVP? Current answer: no.
- Paid plan vs self-hosted? Cost, operations and data residency are undecided.
