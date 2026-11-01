# ADR-0003 — Calculations are advisory, not compliance

- Status: Accepted
- Date: 2026-10-26

## Context

Electrical design software can be mistaken for an approval authority. A green
result can be read as “this installation is legal and safe”. That is false:
compliance depends on the exact edition of the standard, the jurisdiction, the
installation conditions, the protective-device characteristics, verification on
site and the competence of the person signing off.

The MVP only implements a narrow calculation slice (PVC copper, reference
method C). Everything else must fail loudly rather than guess.

## Decision

1. All calculation output is labelled **advisory**.
2. Validation findings never imply approval. A finding can be acknowledged,
   accepted as a risk, or resolved, and the decision is recorded — but the
   design is still not “compliant”.
3. Unsupported inputs throw explicit, typed errors. There is no silent fallback
   to a different insulation, conductor material or installation method.
4. The rule-set version is stored on validation results and shown in the UI.
5. Legal and standards claims require a licensed source and a named reviewer.
   Until then, outputs are marked unverified.
6. AR overlays, when they exist, are never drilling or installation guides.

## Consequences

- Some users will see “unsupported” instead of a number. That is correct.
- The product cannot market itself as “certified” or “compliant”.
- Every result must carry its assumptions and the version that produced it.
- A future licensed rule pack can be added without changing the principle.

## Alternatives considered

- **Best-effort calculation for every case** — rejected: produces plausible but
  wrong numbers, the most dangerous failure mode.
- **Hide the calculation entirely** — rejected: engineers need the arithmetic
  and the assumptions to review it.

## Verification

The electrical package tests assert that unsupported insulation and methods
throw. UI tests assert the advisory notice is present. Validation results persist
`ruleSetVersion`, `decidedAt` and `decidedBy`.
