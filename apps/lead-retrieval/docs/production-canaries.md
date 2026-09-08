# Production Canaries

Lead Retrieval production canaries are an explicit opt-in lane. They are not part of `npm run test:full` and they must not use customer data.

Every canary command refuses to run unless:

```bash
RUN_PROD_CANARIES=1
```

The setup step creates or reuses:

- Company: `Canary`
- Event: `Canary`

Transient canary records and files use the `CANARY_DO_NOT_DELETE` marker. R2 objects are deleted after the R2 canary. The Canary company and event are not deleted.

## Required Environment

Common:

- `RUN_PROD_CANARIES=1`
- `CANARY_TEST_EMAIL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`

Provider-specific:

- OpenAI draft: `OPENAI_API_KEY`
- SendGrid: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`
- R2: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- Audio transcription: `OPENAI_API_KEY`, optional `CANARY_AUDIO_FILE`

Optional:

- `CANARY_R2_PREFIX`, defaults to `canaries/lead-retrieval/`

## Commands

```bash
npm run test:canary:setup
npm run test:canary
npm run test:canary:openai
npm run test:canary:sendgrid
npm run test:canary:r2
npm run test:canary:audio
npm run test:canary:live-db
```

Example:

```bash
RUN_PROD_CANARIES=1 CANARY_TEST_EMAIL=you@example.com npm run test:canary
```

`test:canary` prints `CANARY_COMPANY_ID`, `CANARY_EVENT_ID`, `CANARY_EXHIBITOR_USER_ID`, `CANARY_TEST_EMAIL`, and `CANARY_R2_PREFIX`, then prints a `PROVIDER_CALLED ...` line for each real provider call.

Do not set `CANARY_TEST_EMAIL` to a customer address. The SendGrid canary sends a real email only to that address.
