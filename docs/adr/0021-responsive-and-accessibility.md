# ADR 0021 — Responsive shell & accessibility

**Status:** Accepted
**Date:** 2026-07-01
**Relates to:** [ADR 0016](0016-settings-and-white-label.md) (the user-chosen brand colour this makes legible). Phase-5 hardening, slice 6.

## Context

The app was **desktop-only**. The sidebar was a hard-coded `w-60` aside, always
visible, with no hamburger/drawer and no breakpoints — on a phone it permanently
ate 240px and there was no way to collapse it. The shared `Modal` was not an
accessible dialog (no `role="dialog"`/`aria-modal`, no focus trap, no focus
restoration, an unlabeled close button). And the white-label **brand colour**
(admin-chosen) was rendered as a background under a white logo mark with no
contrast-safe foreground, so a light brand colour produced white-on-pale.

## Decision — Pass A (shell + shared a11y primitives)

The load-bearing changes touch a few shared files and benefit the whole app.

- **Mobile shell.** `AuthGate` holds the drawer state and renders a mobile top
  bar (hamburger + business name) shown only below `md`. `Sidebar` becomes an
  **off-canvas drawer** on mobile (`fixed inset-y-0 -translate-x-full` slide-in
  with a backdrop) and a **static `w-60` column from `md` up** (`md:static
  md:translate-x-0`). The drawer closes on nav-item click, backdrop click, and
  **Escape**.
- **Accessible `Modal`** (one file → every modal: contacts, calendar, agents,
  settings, the sidebar password change). Adds `role="dialog"`, `aria-modal`,
  `aria-labelledby` (an `useId`'d `<h2>`), moves focus into the dialog on open,
  **traps** Tab/Shift+Tab within it, **restores** focus to the trigger on close,
  and labels the close button (`aria-label="Cerrar"`).
- **Brand-colour contrast.** `lib/color.ts` `readableTextColor(hex)` (WCAG
  relative-luminance → black or white) is applied to the logo mark wherever
  `brandColor` is a background (sidebar, login, settings preview), so the mark
  stays legible on any chosen colour.

## Decision — Pass B (page-level responsiveness)

Also shipped, on the data-dense screens: the conversations inbox gets a **mobile
list/detail toggle** (driven by the existing `selected` state — the thread list
is full-width until a thread is opened, then the message pane takes over with a
back button; side-by-side from `md` up); the tables (contacts/users/audit) move
from clipping `overflow-hidden` to **`overflow-x-auto`** (with a `min-w` so they
scroll rather than crush); the **calendar** toolbar wraps and its nav buttons get
labels; page padding softens to **`p-4 sm:p-8`** across the pages; and the
contacts row + calendar-nav icon buttons get `aria-label`s. The calendar **week
view** — whose 24-hour × 7-day grid is impractical on a phone — switches to a
**per-day agenda list** below `md` (the hour grid stays from `md` up); the month
grid was already usable on mobile.

## Alternatives considered

- **A dialog/UI library (Radix, Headless UI).** Adds a dependency; the app
  hand-rolls its `ui/` primitives, and a focus-trap + ARIA is a small,
  dependency-free addition. Rejected (deps / consistency).
- **A full theme engine for the brand colour.** Overkill — the accent only
  styles the logo mark. The contrast helper keeps it legible without re-theming
  every component.
- **A CSS-only drawer (checkbox hack).** The open/close state is trivial in
  React; explicit state with Escape + backdrop is clearer and more accessible.

## Consequences

- The app is usable on a phone: the sidebar collapses to a drawer and content
  isn't crushed. Modals are keyboard- and screen-reader-accessible everywhere.
  The brand mark stays readable on any brand colour.
- Frontend-only; the backend / `configureApp` are untouched.
- Pass A landed the shared shell + primitives (load-bearing); Pass B finished the
  data-dense pages (inbox toggle, scrollable tables, calendar toolbar + a
  mobile week-view agenda, padding, icon-button labels). No automated a11y harness
  yet — verified by `pnpm lint` + a manual narrow-viewport / keyboard check.
