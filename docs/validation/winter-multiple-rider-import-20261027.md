# Winter Excel: multiple riders, manual additions and candidates without a club

## Changes

- Integrate the existing guided-import branch at `ff7e1717c1e110f1e486a0404428ce800a9ed001` into the current Winter preparation branch at `6b372d25d38fe6f97af6e81a34a895856ef9aa3e`. The preparation URL previously lacked the already implemented inline tables, roster correction and registration overview. The clean merge retains the current Winter bank destination and install routes.
- Split explicit rider separators (including middle dots and newlines) within a competition/horse cell. Parentheses and `=OP` apply to individual riders. Preserve spaces within names and a complete known roster name containing a middle dot.
- Add missing riders, horses and entries directly in the shared review table. A row action copies competition and horse, leaving rider selection and OP explicit. Source rows and Excel origin values remain immutable. Manual rows are marked, removable, validated in checkpoints and assigned stable registration IDs.
- Show the complete competition name as wrapping text below its selector.
- Allow name, reading and JEF-number candidates with an empty application club. Preserve explicit identity choices when the club is subsequently entered. Number-only choices fill missing name/reading fields without replacing entered corrections. Club/affiliation validation still runs before registration.
- If the full event snapshot fails, an independently authorized roster read can still make candidates selectable. The UI identifies the incomplete event/fee check and registration remains blocked until it succeeds. Authorization is never skipped.

## Validation

Only synthetic data and in-memory service stubs were used. No uploaded Excel, personal data, production authentication, database migration or database write was used in this task.

- `tsc --noEmit --incremental false`: passed.
- `next build --webpack`: passed; 26 routes generated. The default local Turbopack build rejected the dependency symlink outside the checkout; the source/config was not modified to bypass that restriction. Vercel's normal build must be checked separately.
- Application parser, draft, controller, registration, services, credentials, guide, autofill and shared-table tests: passed.
- Synthetic multi-rider workbook: 20 entries, 6 OP entries, entry fees 170,000 and 5 horse registrations totaling 240,000. Covers known middle-dot names, stable source keys, manual row checkpoint roundtrips, forbidden source mutation, fee calculation and duplicate-free retry.
- Blank-club name/number candidates, retained selection after a club edit, missing name autofill, independent roster read, authorization failures, and a failed full-snapshot read: passed with mocked services.
- Registration overview, preregistration components, shared roster, settlement, bank details, public reception and shared Autumn rendering regression checks: passed.
- Local HTTP checks: six Winter routes resolve the Winter install manifest and the Winter reception links; Autumn manifest unchanged.
- Table component checks cover 60 entries, wrapping/full competition labels, responsive container structure, editable cells and disabled controls during processing/frozen registration. Browser pixel/interaction verification remains **unperformed**: no Chromium executable was available and the standard Playwright browser download returned an unusable archive. No successful browser run is claimed.

An initial broad test glob also invoked two fixture helpers as standalone tests and ran an HTTP test before a local server was available. Those were invocation errors; the actual test modules and the HTTP test were subsequently run with their required setup.

## Scope

No `main` update, Autumn production deployment, permission change, automatic database migration or real entry registration is included. Existing migration source files enter the preparation branch through the integration; they are not executed by this work. Re-read the real workbook in the updated Winter review screen before the administrator confirms registration.
