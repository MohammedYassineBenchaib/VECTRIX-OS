# PVGIS 5.3 — solar production

| Field | Value |
|---|---|
| Provider | European Commission, Joint Research Centre (JRC) |
| Purpose | Photovoltaic production and irradiance reference for a site |
| Programme status | In use — legacy `ecotrack` application |
| Status in this repository | **Not wired.** No client, route or fixture exists in `apps/` or `packages/`. |
| Client location | None yet. If added: `apps/web/src/lib/apis/pvgis.ts` (server-only) |
| Verified on | 2026-10-26 |

> This file exists because `AGENTS.md` requires an API record before any client
> code. It records verified terms and the exact endpoint contract. It does not
> claim that VECTRIX OS currently calls PVGIS: it does not.

## Licence and terms

The JRC states: “The information provided by PVGIS is free and there are no
restrictions on its use.” Users are asked to acknowledge the source
(Photovoltaic Geographic Information System — PVGIS, European Commission Joint
Research Centre) and cite the main PVGIS page. Output does not represent the
opinion of the European Commission, and the Commission accepts no
responsibility for use of the information.

Source: <https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/general-information/usage-conditions-data-protection_en>

Consequences for VECTRIX:

- Attribution must be visible wherever a PVGIS-derived number is shown or exported.
- Results remain advisory inputs, not a compliance statement.
- No API key and no registration are required.

## Endpoint

Base (versioned):

```
https://re.jrc.ec.europa.eu/api/v5_3/
```

Tools: `PVcalc`, `SHScalc`, `MRcalc`, `DRcalc`, `seriescalc`, `tmy`,
`printhorizon`.

The version is part of the path. Pinning `v5_3` prevents a silent upstream
upgrade from changing results. `v5_2` remains available; the unversioned
`/api/` entry point serves 5.2 for a limited period. Do not use it.

Example (grid-connected PV, 1 kWp, 14 % losses):

```
GET /api/v5_3/PVcalc?lat=38.72&lon=-9.14&peakpower=1&loss=14&outputformat=json
```

Required parameters for `PVcalc`: `lat`, `lon`, `peakpower`, `loss`.
`outputformat=json` is recommended for machine consumption. See the full input
table in the JRC API documentation:
<https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en>

## Transport rules

- `GET` only. Other methods return `405`.
- AJAX/CORS is not allowed. Calls must be server-to-server.
- Rate limit: **30 requests per second per IP**. Exceeding it returns `429`.
- Excess concurrent computations are queued and may return `529` after a few
  seconds; retry later with backoff.
- Out-of-range input returns a JSON error naming the expected range.

## Client requirements (if implemented)

1. Server-side only, never from the browser, never with a browser secret.
2. Zod-validate the query and the response; reject unexpected shapes.
3. Timeout (10 s), bounded retries (2) with exponential backoff on `429`/`529`
   and network errors only — never retry a `4xx` validation error.
4. Cache per rounded coordinate (6 decimal places) and parameter set. Solar
   resource changes slowly; a 30-day cache is appropriate and reduces load.
5. One request per user action or explicit refresh. No prefetching of grids.
6. Surface `429`, `529` and validation errors as typed, user-readable errors.
7. Record `outputformat`, endpoint version and retrieval date with any stored
   result so it can be reproduced.

## Tests required before shipping

- Recorded JSON fixture for a Lisbon coordinate; no live calls in tests.
- Timeout, `429`, `529`, malformed JSON and out-of-range cases.
- Assert attribution is rendered with the result.
- Assert a cached second call performs no network request.

## What PVGIS does not provide

PVGIS does not size electrical installation cables, verify Portuguese rules,
produce a circuit schedule or approve a design. It must never be presented as
doing so.

## Open questions

- Does the product need PVGIS at all in the electrical MVP? Current answer: no.
  The electrical workspace has no solar surface, and adding one would be scope
  creep until a solar workflow is designed.
- If it is added, decide whether results are stored per project (recommended,
  with retrieval metadata) or requested live.
