# Accessibility

- Status: partial WCAG 2.2 AA work, **not audited**
- Last checked: 2026-10-26
- Target: WCAG 2.2 Level AA for the shell, forms, dialogs, plan controls and
  validation states
- Automated checks: `apps/web/e2e/a11y.spec.ts` (6 tests)

> This is a self-assessment against a subset of WCAG 2.2 AA. It is not a
> conformance claim and there has been no screen-reader, switch-access or
> independent audit.

## 1. What is implemented

### Structure and language

- `<html lang="en">` is set in `apps/web/src/app/layout.tsx`.
- The project index has a single `<h1>` (“Projects”), a `<main>`, a labelled
  portfolio section and a labelled project-list section.
- The workspace command bar is a `<header>`; the view rail is a
  `<nav aria-label="Workspace sections">`.
- Circuits, findings and materials views each expose an `<h1>`.
- Dialogs use `role="dialog"`, `aria-modal="true"` and
  `aria-labelledby` pointing at their title.
- The command palette uses `role="dialog"`, a labelled search input, a
  `role="listbox"` result list, `role="option"` items and
  `aria-activedescendant`.
- The project switcher and account menu expose `aria-expanded` and
  `aria-haspopup`.
- Circuit filters use `aria-pressed`; toast notifications use
  `aria-live="polite"`.

### Keyboard

- Command palette: `Ctrl/Cmd+K` opens, the search field receives focus,
  Arrow keys move the active option, Enter activates it, Escape closes.
- Dialogs: Escape closes; the new-project dialog focuses “Project name” on
  open.
- Project index: all controls are native buttons, links or inputs with visible
  focus.
- Circuit schedule rows are focusable (`tabindex="0"`) and respond to
  Enter/Space.
- Findings rows are focusable and respond to Enter/Space.
- Plan equipment symbols are `role="button"`, focusable, and select on
  Enter/Space.
- There are no positive `tabindex` values.
- `:focus-visible` uses a 2 px outline with offset, in both themes.

### Pointer and touch

- Press targets meet the 24 × 24 CSS px minimum in the shell and toolbars;
  the plan uses larger symbol hit areas.
- The mobile layout exposes a tab bar, drawers and a full-height plan sheet
  rather than relying on hover.
- Drag, draw and route-point actions have button-based alternatives for
  selecting the tool, but **not** for placing or moving geometry (see gaps).

### Motion and theme

- `prefers-reduced-motion: reduce` collapses animation and transition
  durations to 0.01 ms and disables smooth scrolling globally.
- Light and dark themes are both authored; the theme is chosen before paint
  from a fixed `light`/`dark` value and can be toggled from a labelled button.
- Circuit identity uses colour plus text labels, line numbers and the
  inspector; severity uses an icon, a text label and a left border, not colour
  alone.

### Zoom and reflow

- The app shell is viewport-locked, but internal registers scroll.
- At 200 % browser zoom the desktop layout collapses according to the
  breakpoints below; the E2E mobile project checks zero page-level horizontal
  overflow at 390 × 844.
- Content is not clipped by a fixed pixel width at the tested mobile size.

## 2. Colour contrast

Measured with the WCAG relative-luminance formula. Normal text needs 4.5:1;
large text (≥ 24 px, or ≥ 18.66 px bold) needs 3:1. Ratios below are
approximate because they ignore anti-aliasing and font weight.

| Pair | Ratio | Use | Result |
|---|---:|---|---|
| `--ink` on `--surface` | 16.53 | Body text | Pass |
| `--ink-secondary` on `--surface` | 7.46 | Secondary text | Pass |
| `--ink-muted` on `--surface` | 5.67 | Muted labels | Pass |
| `--ink-muted` on `--ground` | 4.63 | Muted text on shell | Pass |
| `--rail-ink` on `--rail` | 14.76 | Dark rail text | Pass |
| `--rail-muted` on `--rail` | 6.49 | Rail secondary | Pass |
| `--accent-ink` on `--accent` | 6.93 | Primary button | Pass |
| `--danger` on `--danger-soft` | 4.77 | Error chip | Pass |
| `--warning` on `--warning-soft` | 4.78 | Warning chip | Pass |
| `--warning` on `--rail-ink` | 5.04 | Rail badge | Pass |
| `--ok` on `--surface` | 6.17 | Success text | Pass |
| `--sheet-ink` on `--sheet` | 14.85 | Drawing text | Pass |
| `--sheet-muted` on `--sheet` | 4.86 | Sheet annotations | Pass |
| Dark `--ink` on dark `--surface` | 14.83 | Body text | Pass |
| Dark `--ink-muted` on dark `--surface` | 5.38 | Muted labels | Pass |
| Dark `--sheet-muted` on dark sheet | 4.60 | Sheet annotations | Pass |
| Dark `--danger` on dark `--danger-soft` | 5.00 | Error chip | Pass |

The light `--ink-muted`, `--danger`, `--warning` and `--sheet-muted` tokens
were darkened during this review so that their small-text ratios clear 4.5:1;
the dark sheet-muted token was darkened for the same reason. These are token
changes only, not layout changes.

**Caveat.** Ratios were computed from the token hex values, not sampled from a
rendered screenshot. Opacity, `color-mix`, gradients and disabled states can
reduce effective contrast and are not covered by this table. Disabled controls
are exempt from contrast requirements, but should still be distinguishable.

## 3. Responsive behaviour

| Breakpoint | Behaviour |
|---|---|
| > 1280 px | Full desktop: rail, plan, inspector, utility column |
| ≤ 1280 px | Tool keycaps and sheet reference hidden; core layout intact |
| ≤ 1020 px | Inspector becomes a drawer |
| ≤ 760 px | Utility column becomes a drawer; mobile view tabs replace the rail; plan can take the viewport |
| ≤ 520 px | Further compaction of labels and actions |

The checked mobile viewport is 390 × 844 (Pixel 7 profile). Tablet and 200 %
zoom at 1440 px are not separately tested.

## 4. Known gaps

These are real gaps, not planned features presented as complete.

1. **No skip link.** Keyboard users must traverse the command bar to reach the
   view content.
2. **No focus trap in dialogs or the command palette.** Tabbing can move focus
   behind an open modal. Focus is not explicitly restored to the trigger on
   close.
3. **The workspace has no `<main>` landmark and the plan view has no `<h1>`.**
   Circuits, findings and materials do; the plan does not.
4. **No keyboard path for placing or moving geometry.** Plan equipment can be
   selected with Enter/Space, but not nudged or dragged; rooms, walls and route
   points require a pointer. This is the largest accessibility gap.
5. **Plan equipment creates many sequential tab stops.** Roving tabindex or a
   device list as an alternative navigation surface is not implemented.
6. **Mobile tabs are partial.** `role="tablist"`/`role="tab"` are present, but
   there are no `aria-controls`/`tabpanel` relationships or Arrow-key handling.
7. **Form errors are not associated with fields.** Errors appear in a
   `role="alert"` region, but inputs do not get `aria-invalid` or
   `aria-describedby`.
8. **No live announcement of plan changes** beyond toasts. The next-route
   announcer is a second `role="alert"`; the palette and inspector do not
   announce selection changes.
9. **Colour is used for circuit identity on the plan** (coloured bars and
   strokes). The inspector and busbar provide text alternatives, but the plan
   alone is not sufficient.
10. **No RTL.** Arabic is planned; the layout has no logical-property audit and
    `dir` is never set.
11. **No 200 % zoom test at desktop width, no 320 px test, no forced-colours or
    high-contrast mode test.**
12. **No screen-reader test.** Names and roles are present in the DOM, but
    reading order and announcements have not been verified with NVDA, JAWS or
    VoiceOver.
13. **No automated axe scan or contrast assertion in CI.** The E2E checks are
    structural and keyboard-focused.

## 5. Verification

`apps/web/e2e/a11y.spec.ts` checks:

1. `lang="en"` and one level-1 “Projects” heading.
2. Every visible button has an accessible name on the project index and in the
   populated workspace.
3. New-project dialog controls are labelled and the first field is focused.
4. Circuit table has column headers and a focusable first row.
5. No positive `tabindex` values.
6. Command palette opens from the keyboard, focuses its input, and closes on
   Escape.

`apps/web/e2e/mobile.spec.ts` additionally checks zero page-level horizontal
overflow and that the drawing sheet fits the mobile viewport.

Manual checks performed: keyboard traversal of the shell, dialogs and palette;
light/dark token inspection; computed-contrast calculation; reduced-motion CSS
review. No screen reader was run.

## 6. Priority actions

1. Add a skip link and a `<main>` landmark; give the plan view an `<h1>`.
2. Add keyboard placement/nudging for equipment and a device-list alternative.
3. Trap and restore focus in dialogs and the palette.
4. Associate field errors with `aria-invalid`/`aria-describedby`.
5. Add Arrow-key behaviour and tab/panel wiring to the mobile tabs.
6. Add axe-core and a contrast check to the E2E suite.
7. Run a screen-reader pass and a 200 % zoom / 320 px pass.
8. Plan an RTL and logical-property audit before Arabic ships.
