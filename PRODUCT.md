# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Design engineers and electrical designers in small-to-mid engineering studios who prepare installation designs for residential and light-commercial buildings. They work at a desktop with a plan drawing, a circuit schedule and a customer brief open at once, and they need to leave a defensible design that a technician can install from. A secondary audience, not optimised for in this release, is the installing technician receiving the issued plan.

## Product Purpose

VECTRIX OS turns a measured floor plan into an electrical installation design: equipment and outlets placed in plan, circuits and terminal connectivity defined, routes drawn, calculations checked, quantities produced and the design issued with a visible record of what was and was not verified. Success means an engineer can move from a blank floor to a reviewed, quantified, exportable design without re-keying geometry or hiding assumptions in a spreadsheet.

## Positioning

One spatial model connects drawing, circuit topology, calculation and material take-off. Moving an outlet changes its circuit load, its route length, the voltage-drop result, the bill of quantities and the open findings — rather than each living in a separate file that must be reconciled by hand.

## Operating Context

Electrical design is the first discipline. A project contains buildings, levels, rooms, walls, equipment, terminals, connections, circuits, routes, validation findings, a load schedule and a take-off. Design work is revisioned and advisory; software results never constitute legal or regulatory approval. Route state moves from visual to proposed to validated to installed, and validation never implies engineering approval. Portuguese/EU practice is the reference market, but the product is positioned worldwide and the interface ships in English first, with multilingual architecture (PT, EN, FR, ES, AR + RTL) planned and metric/imperial units supported by the data model.

## Capabilities and Constraints

Implemented in this MVP: project creation and templates, a 2D SVG plan workspace with rooms, walls, equipment and routes, equipment library placement and editing, circuit definition and assignment, terminal connectivity, manual and orthogonal auto-routing, advisory validation with acknowledgement/accepted-risk states, load schedule, cable selection for PVC copper reference method C, material take-off with CSV export, session authentication, and a seeded demo apartment.

Constraints: electrical only; no manufacturer catalogue data; no imported DWG/IFC/PDF underlay yet; 3D and AR are not implemented; PostgreSQL is the production target while SQLite is the local runtime; API integrations are limited to those listed in `AGENTS.md`; calculations are advisory and labelled; AR overlays must never be treated as drilling guides.

Explicitly undecided: pricing, commercial packaging, certification claims, trademark availability, final brand name (VECTRIX is provisional), and any claim of regulatory compliance.

## Brand Commitments

The name VECTRIX is provisional and must not be presented as trademark-cleared or available. No customer logos, testimonials or regulatory badges may be invented. The interface must never imply that a passing validation makes a design legally compliant.

## Evidence on Hand

The repository contains a fully specified synthetic demo: a two-bedroom Lisbon apartment (`VX-DEMO-001`), 11,000 × 8,000 mm plan, 8 rooms, 12 walls, 39 devices, 8 circuits, 8 routes and partial terminal connectivity. This is authored demonstration data, not a real client project. There are no real customers, case studies, press mentions, certifications or benchmark results.

## Product Principles

1. Show the evidence behind every result: assumptions, values, rule-set version and unsupported cases stay visible.
2. Separate assistance from engineering judgement: validation findings are advisory, and acknowledgement is not approval.
3. Keep one source of truth: every view reads the same spatial and circuit model.
4. Make the next action obvious without hiding the system: dense engineering data is organised, not simplified away.
5. Refuse to fake a capability: planned or blocked functions are labelled, never rendered as working controls.

## Accessibility & Inclusion

Target WCAG 2.2 AA for the application shell, forms, dialogs, plan controls and validation states. The plan canvas needs keyboard-reachable controls and a non-colour-dependent way to read circuit and severity states. Arabic and RTL are planned; no RTL implementation exists yet.
