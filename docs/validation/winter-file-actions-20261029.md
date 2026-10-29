# Visible file actions — 2026-10-29

## Problem and change

The Winter arrival/departure editor rendered the browser's file chooser as plain text after the CSS reset. Users could not distinguish the action from explanatory prose.

- Added `MasterFilePicker` in the shared presentation layer: a real, blue, outlined button with file icon, 56px minimum target, keyboard focus ring, wrapping text, adjacent explanation and selected filename. It opens the native chooser synchronously, preserves same-file reselection, and respects busy/disabled states.
- Applied it to the date-only Excel reader, application Excel selection and both application resume JSON selectors. Application drag/drop and explicit read/compare remain available.
- Date-only reading now says reading in progress, read complete / save pending, saving, or saved. Reading does not claim that data has already been saved. Wrong-club and failed reads retain the existing validation and error feedback.
- Shared native file-selector styling also restores blue buttons in older CSV, prepared JSON and meeting-draft controls without changing their handlers.
- Disclosure headings in the shared application and stable-information screens have a blue background/border, visible native triangle and keyboard focus ring.

No persistence, permissions, fees, registration IDs or event adapters changed. No real files were imported and no participant or date records were written during validation. The new components are reusable shared master components; Autumn does not yet have the Winter application-import or stable-report adapters. Existing Autumn input-form regression passes; the Autumn production deployment is excluded.

## Verification

- TypeScript `tsc --noEmit --pretty false`: pass.
- `next build --webpack`: pass, 26 routes.
- Existing Node suites: `winter-stable-schedule-components`, `winter-application-table`, `winter-application-components`, `winter-application-registration-components`, `winter-stable-information`, `winter-stable-reports`, `master-input-forms`, `winter-master-input`: pass.
- Existing component test traversal updated for the shared file picker and specific saving status; the table assertion excludes only hidden native file inputs, still requiring editable rows to remain visible. The synthetic React harness now supports `useId`.
- `git diff --check`: pass.
- Physical iPad/native file-dialog behavior and authenticated live-admin interaction: not verified in this environment. Component and registration checks use synthetic fixtures, with real network forbidden.

Release target: `daikuma10-a11y/fuji-horse-show`, `prep/winter-2026`, Vercel `fhs_fix` preview only. Never Autumn production `fhsfix.vercel.app`.
