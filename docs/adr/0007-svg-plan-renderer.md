# ADR-0007 — Custom SVG plan renderer instead of a canvas or mapping library

- Status: Accepted, with accessibility follow-up
- Date: 2026-10-26

## Context

The plan workspace must show rooms, walls, equipment symbols, circuit-coloured
routes, selection, hover and numbered findings at architectural scale. It must
work offline, support pan and zoom, and remain inspectable by the same DOM that
runs the rest of the interface. The repo has no drawing engine dependency, and
the product must not inherit a licence obligation from one.

Candidates considered: HTML canvas, SVG rendered by React, a mapping library
(Leaflet/MapLibre), a CAD/DXF viewer, and a WebGL scene.

## Decision

Render the plan as **React-managed SVG** in `plan-canvas.tsx`:

- A single `viewBox` drives pan and zoom; the sheet is a white drawing surface
  over the enclosure-grey shell.
- Walls, rooms, routes and equipment are ordinary SVG elements. Equipment glyphs
  are VECTRIX-authored marks in `equipment-glyph.tsx`, not manufacturer or
  standard symbols.
- Equipment and finding annotations receive `tabIndex`, `role="button"` and
  ARIA labels; the SVG has `role="application"` and a descriptive label.
- Pan is pointer drag (middle button or the pan tool); zoom is wheel or toolbar
  buttons with a plan-point anchor. Fit-to-sheet is a button.
- Draft geometry is kept in local state. `Escape` cancels a draft; `Enter` or a
  double-click finishes a route or room. Only successful API mutations refresh
  the workspace.
- Circuit isolation dims every route not belonging to the selected circuit. The
  selection is state, not a filter that hides data.
- Numbered margin annotations point to open findings (maximum nine shown, with a
  `+n` overflow marker).
- All colour is paired with a label, shape, number or state chip. Circuit colour
  is identity, not the only carrier of meaning.

## Consequences

- No third-party drawing licence, no WebGL requirement and no separate hit-test
  model: the DOM is the hit-test model.
- SVG with hundreds of nodes is acceptable for a residential plan; it will need
  virtualisation, level-of-detail or a canvas fallback for very large projects.
  This has not been measured beyond the demo.
- Zoom and pan feel immediate because they only change the viewBox; they do not
  relayout the model.
- Browser text selection and focus order are manageable but need deliberate
  handling inside `role="application"`.
- Print/PDF export is not implemented; the SVG structure makes it feasible
  later.

## Known gaps

- Keyboard users can select equipment and activate finding annotations, but
  cannot place, move or draw geometry with the keyboard alone. Pointer input is
  still required for authoring.
- No screen-reader audit with NVDA/JAWS/VoiceOver has been performed.
- No touch-specific pinch-zoom gesture; the toolbar zoom works on touch.
- No minimap for large plans.
- No plan print/PDF sheet export.

## Alternatives considered

- **HTML canvas** — rejected for the MVP: hit-testing, focus and accessible names
  would be reimplemented by hand, and the visual style is not performance-bound
  at demo scale.
- **Leaflet/MapLibre** — rejected: built for geographic projections, tiles and
  web-map interaction; the abstractions fight architectural millimetre plans and
  add a large dependency.
- **DXF/IFC viewer** — rejected: import/export is a separate, larger capability;
  the data model does not yet carry CAD entities.
- **WebGL/Three.js** — rejected: overkill for a 2D MVP and hostile to accessible
  DOM semantics.

## Verification

- `apps/web/e2e/a11y.spec.ts` asserts no unnamed visible buttons, no positive
  `tabindex`, focusable schedule rows, and a labelled plan application.
- `apps/web/e2e/mobile.spec.ts` asserts the sheet fits a 390 × 844 viewport and
  page-level horizontal overflow stays at zero.
- `apps/web/e2e/workspace.spec.ts` covers circuit isolation and clearing it.
- `apps/web/e2e/design.spec.ts` covers drawing walls, placing equipment and
  creating a route through the plan.
