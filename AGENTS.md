# Fuji Horse Show shared master

The organizer requires a shared application master based on the validated Autumn test version.

- Put shared screen rendering and interaction in `components/master/`, and neutral contracts in `lib/master/`.
- Both Autumn and Winter must use the same master components. Do not copy a screen into another season, change its spacing or replace its gestures as a routine tournament setup choice.
- Tournament differences belong in configuration/data: event ID/dates, competitions, fee categories, participant rosters and timetable. Keep event-scoped data adapters and authorized persistence separate from presentation.
- Improvements to common behavior belong in the master and require checking both adapters. Do not discard Autumn fixes when preparing another tournament.
- Keep Winter event isolation, server fee calculation, admin authorization, stable retry IDs and payment audit behavior. UI reuse never authorizes an Autumn API call from Winter.
- Preserve shared identities and multiple club affiliations. Do not merge people or horses solely by names.
- Commit and push each completed checkpoint. Do not deploy Autumn production `fhsfix.vercel.app` while working on Winter previews.
- Record incomplete master migrations honestly; configuration scaffolding does not mean that every older screen has been migrated.

- If implementing the request would require departing from the organizer's agreed master design, or changing the agreed screen/operation, explain the reason and impact and ask before implementing that departure. Routine work within the approved master migration is already authorized.
