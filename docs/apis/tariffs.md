# Electricity tariffs — payback inputs

| Field | Value |
|---|---|
| Provider | **None selected** |
| Purpose | Energy price and power-term inputs for a payback estimate |
| Programme status | No API chosen |
| Status in this repository | **Not implemented.** No tariff UI, client or calculation. |
| Verified on | 2026-10-26 |

## Why there is no API record yet

`AGENTS.md` requires a chosen provider and a verified terms record before any
client code. No public, licensed tariff API for the Portuguese market has been
verified for this project. Therefore:

- No endpoint is invented here.
- No scraping of supplier websites is permitted without a licence review.
- No tariff data is bundled or hard-coded.

## What a tariff model needs

A payback estimate needs, at minimum:

- Contracted power (kVA) and the power-term price (€/day or €/month).
- Energy price (€/kWh), possibly split by time-of-use period.
- Time-of-use windows and whether they differ by weekday/weekend/season.
- Taxes and fees that apply (for example VAT and the audiovisual contribution —
  exact treatment must be verified per jurisdiction and date).
- The tariff's validity date and source.

These are commercial and regulatory facts. They must come from a cited source
or from user input, and every stored value must carry its source and date.

## Acceptable implementation paths

1. **User-entered tariff** (recommended first): the engineer enters the unit
   prices from their supplier contract. No third-party API, no licence risk, and
   the value is defensible because the source is the contract. Store the
   contract date and a free-text source note.
2. **Licensed data provider**: only after a provider is chosen, its terms are
   recorded in this file, and a fixture-based client is written under
   `apps/web/src/lib/apis/`.
3. **Regulator open data**: only if a specific dataset is identified, its
   licence verified, and its update cadence documented. “Open data” is not a
   licence by itself.

## UI and safety requirements

- Payback output is an estimate, not financial advice.
- Show the tariff source, date and every assumption next to the result.
- If the tariff is “unverified”, show a visible warning, as required by
  `AGENTS.md`.
- Never imply a payback figure is guaranteed or validated.
- Currency and locale must be explicit; do not assume EUR worldwide.

## Before implementation

- [ ] Choose a provider or confirm user-entered-only for the release.
- [ ] Verify licence and redistribution terms.
- [ ] Record the endpoint/contract in this file with a verification date.
- [ ] Add a fixture-based unit test and a typed error path.
- [ ] Add the visible “unverified” warning path if any source is unverified.
