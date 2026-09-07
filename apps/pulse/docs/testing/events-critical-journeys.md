# Voice Events critical journey test strategy

## Coverage inventory

| Layer | Current examples | Boundary proven | Classification |
| --- | --- | --- | --- |
| Unit | `lib/event.test.ts`, response-mode and consent tests | Pure contracts and mocked Prisma collaborators | Unit |
| Route/service | `app/api/response/create/route.test.ts`, event survey service tests | Handler validation and service rules with mocked application dependencies | Route/service integration (mocked persistence) |
| Browser | `e2e/events-voice-journeys.spec.ts` | UI state and request shapes using `page.route` responses | Mocked browser E2E |
| Database | `tests/integration/events-critical-real-db.test.ts` | Canonical organizer service, launch resolution, Response writes, targeting, persisted setup | Real Postgres integration |
| Browser + database | `e2e-real/events-critical-real.spec.ts` | Browser -> real Next routes -> Prisma -> migrated Postgres | Real non-mocked browser E2E |

The pre-existing browser suite remains valuable for fast, broad UI state coverage. It did not prove that application writes matched deployed migration history because it intercepted the application's own APIs. The real suites supplement it at the critical boundaries.

## Critical gaps closed

- Token launch had no browser test that executed the real `/api/response/create` insert.
- Text mode had no cross-boundary proof from consent selection through persisted `Answer` and transcript.
- Organizer response modes were not proven to drive the real attendee UI and persisted attempt mode.
- Legacy `eventId` compatibility was mocked in the browser.
- Multiple survey targets were not proven isolated against real rows and question ownership.
- Inactive, expired, and unknown links were not proven to create zero Responses.
- An organizer-created survey/link was not consumed by a real attendee launch in the same fixture.
- Event Areas, Agenda/session setup, speaker assignment, attachment, and public-link state had no compact persisted-state consistency journey.
- CI did not reconstruct an empty database from migrations before exercising `Response.responseMode`.

## Fixture and database policy

`tests/real-events/fixture.ts` creates one deterministic EVENTS account and deletes that account before and after each suite. Account cascades contain all fixture locations, events, surveys, links, Responses, Answers, agenda records, and speakers. It never reads or writes production data.

Surveys and public links are created through `createEventVoiceSurvey`; this is the same canonical organizer service used by the product. A focused integration also executes the real organizer POST and publish PATCH handlers, mocking only the external authenticated-user lookup while retaining route validation, account scoping, the canonical service, and real Prisma writes. Only prerequisite account/event/structure/speaker state and intentionally inactive/expired link flags are direct fixture writes. External TTS/storage/AI are stubbed after the application/database boundary.

The CI database starts empty and is built exclusively with `npx prisma migrate deploy`. `prisma db push` is prohibited in this gate. A missing `Response.responseMode` migration therefore fails either the explicit column assertion or the first real Response insert.

## Canonical pre-production command

Run the same migration-first gate locally and in CI with:

```bash
npm run test:preprod
```

The command validates and generates Prisma, typechecks, runs the full Vitest suite, runs all 52 mocked Events browser journeys, provisions a disposable local Postgres database from committed migrations, checks migration/schema drift, and then runs the 8 real-database plus 8 real-browser journeys. In CI it accepts only a localhost database whose name contains `test`; locally it starts and removes its own isolated Postgres service. Transaction-pooler URLs on port 6543 are rejected for the real suites.

For a quiet CI summary with detailed output in the ignored `.preprod-results/preprod.log` file, run:

```bash
npm run test:preprod:quiet
```

## Production smoke

Create a dedicated, non-customer smoke account with disposable surveys whose event name begins with `[SMOKE]`. Keep one token that accepts Voice and one that accepts Text (they may belong to one attendee-choice survey). Then run after deploy:

```bash
SMOKE_BASE_URL=https://your-production-host \
SMOKE_VOICE_TOKEN=... \
SMOKE_TEXT_TOKEN=... \
SMOKE_DISPOSABLE_EVENT_ACK=I_ACKNOWLEDGE_THIS_IS_A_DISPOSABLE_SMOKE_EVENT \
npm run smoke:events:public-launch
```

The guard refuses to write unless the acknowledgement is exact and both tokens resolve to an event prefixed `[SMOKE]`. The command proves T&C lookup, Response creation, mode persistence, target linkage in the response contract, and first-question resolution. It prints created Response IDs for the disposable event's normal retention cleanup. This is a post-deploy signal, not a substitute for the migration-first CI gate.

## Journey matrix

| Journey | Real DB integration | Real browser |
| --- | --- | --- |
| Public Voice | Response/link/mode assertions | T&C -> first Voice question |
| Public Text | Response/link/mode assertions | T&C -> text submit -> Answer/transcript |
| Organizer mode | Canonical survey service | Voice-only, Text-only, choice Voice and choice Text |
| Legacy kiosk | Real event Response/question lookup | `/kiosk?eventId=...` |
| Target integrity | Cross-survey question rejection | Specific token shows only its question |
| Link lifecycle | Zero-write rejection assertions | Safe inactive/expired/invalid screens |
| Setup -> attendee | Canonical generated link launch | Generated link consumed by browser |
| Persisted setup consistency | Area, session, speaker assignment, survey target/link | Attached session survey launch |
