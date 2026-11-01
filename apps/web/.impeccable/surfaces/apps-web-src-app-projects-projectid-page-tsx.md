---
version: 1
slug: "apps-web-src-app-projects-projectid-page-tsx"
primary_target: "apps/web/src/app/projects/[projectId]/page.tsx"
related_targets: []
---

# Surface brief — plan workspace

Mode: Operate. Primary and only surface in this build: the live engineering workspace plus its login and project index.

## Audience and job

A design engineer opens a populated project to inspect the plan, circuit schedule and open findings, then makes a change, revalidates and exports quantities. Success is that the relationship between a placed device, its circuit, its route length, its load and its open evidence is legible without leaving the screen.

## Chosen direction

Switchboard schedule. The shell is a powder-coated enclosure; the plan is a drawing sheet inside it; circuits behave like a breaker directory. The world supplies exactly four things: type, palette, density and the signature circuit busbar. Navigation and controls remain standard web controls.

## Signature moment

The circuit busbar: a horizontal directory of breaker tabs above the plan. Selecting one dims unrelated geometry, highlights its equipment and routes, and opens its load/cable inspector. Findings are numbered margin annotations on the drawing sheet, not a detached notification list.

## Direction contract

THESIS: The workspace is a switchboard schedule you can draw on. It refuses the generic dark CAD canvas with floating glass panels; every surface belongs to one powder-coated enclosure, one drawing sheet, one breaker directory.

OWN-WORLD: Enclosure grey #E4E6E0 ground, graphite #1A1D1B command rail, drawing-sheet #FCFCF8, signal red #B93B2F, warning ochre #A9761B, verified green #2E6A55, drafting blue #245A9E. Cable-core circuit colours: brown, black, grey, blue, green-yellow. Archivo for interface, JetBrains Mono for dimensions, IDs and numeric tables. Rules are 1px hairlines, rows 32–36px, radii 4–8px, shadows only for lifted controls.

STORY: The engineer sees the building, the breaker directory and the open evidence at once. Selecting a breaker isolates its geometry and reveals its load; selecting a finding takes them to the exact device; a change is saved, revalidated and exported without a second window.

FIRST VIEWPORT: 56px graphite command bar with wordmark, project identity, validation tally and account. 64px icon rail. Main work area: 264px utility column (levels, rooms, equipment library), plan sheet at 1fr with a 72px title block and the circuit busbar directly above it, 360px inspector. The plan owns roughly 60% of 1440×900. A findings margin runs at the sheet edge.

FORM: Grounded candidate 3 of 7, switchboard schedule. seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
