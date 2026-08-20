# Marketing SendGrid Integration

Planner OS Marketing sends email through the existing `EmailProvider` abstraction and ingests SendGrid Event Webhook batches through a sessionless, authenticated API route.

## Endpoint

SendGrid Event Webhook URL:

```text
POST /api/marketing/sendgrid/webhook
```

The route reads the raw request body, verifies the request, parses a SendGrid event array, and calls the marketing service ingestion path. It does not require a logged-in planner session.

## Environment

Outbound send:

- `SENDGRID_API_KEY` - SendGrid API key for outbound email.
- `EMAIL_FROM` - verified sender address used as the default From email.
- `EMAIL_REPLY_TO` - optional default Reply-To address.

Webhook authentication:

- `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY` - preferred public key for SendGrid Signed Event Webhook verification.
- `SENDGRID_WEBHOOK_PUBLIC_KEY` - accepted legacy alias for the same public key.
- `SENDGRID_WEBHOOK_SECRET` - fallback shared secret for environments that have not enabled SendGrid signed webhooks yet. Pass it as `x-sendgrid-webhook-secret` or `Authorization: Bearer ...`.

If neither a public key nor secret is configured, webhook requests fail closed.

## Matching

Outbound marketing sends include recipient-scoped SendGrid `custom_args`:

- `eventId`
- `emailSendId`
- `emailSendRecipientId`

Webhook matching order:

1. `emailSendRecipientId`, cross-checked against `eventId`, `emailSendId`, and recipient email when present.
2. `emailSendId + email`.
3. `sg_message_id` only when it maps to exactly one frozen recipient row.

The webhook never matches by subject, campaign name, or other unstable display copy.

## Events

Supported SendGrid events:

- `processed`
- `delivered`
- `open`
- `click`
- `bounce`
- `dropped`
- `spamreport`
- `unsubscribe`
- `group_unsubscribe`
- `deferred`

`group_resubscribe` and unknown events are ignored safely because the current product does not expose preference-center state.

## Idempotency

Each stored `MarketingEmailEvent` uses unique `sgEventId`.

When SendGrid does not provide `sg_event_id`, the service builds a stable fallback from message id, recipient id, event type, timestamp, URL, and reason. Duplicate events are skipped before counters are updated.

Send counters are unique recipient milestones:

- `deliveredCount` increments once when a recipient first delivers.
- `openCount` increments once when a recipient first opens.
- `clickCount` increments once when a recipient first clicks.
- `bounceCount` increments once when a recipient first bounces or is dropped.
- `unsubscribeCount` increments once when a recipient first unsubscribes or group-unsubscribes.

Additional open/click events are still stored when their `sg_event_id` is unique, but they do not inflate the unique counters.

## Suppression

These events create or update `MarketingSuppression` with `source = SENDGRID_WEBHOOK`:

- `bounce`
- `dropped`
- `spamreport`
- `unsubscribe`
- `group_unsubscribe`

The existing send snapshot path excludes suppressed event recipients before freezing recipients, so future sends for the same event skip suppressed addresses without mutating historical snapshots.

## UI

The Performance tab displays stored counters from `MarketingEmailSend` rows. It does not calculate fake rates, trend bars, paid attribution, or conversion metrics.

The tracking warning is controlled by server-side webhook configuration surfaced through marketing defaults:

- configured webhook auth: no "tracking not connected" warning
- missing webhook auth: clear warning that webhook tracking is not configured

## Testing

Normal marketing regression tests do not send real email. Provider, service, API, and UI tests stay mocked or stubbed so local and CI runs remain fake-safe by default.

There is one explicit opt-in smoke test for real outbound delivery:

```text
npm run test:marketing-email-smoke
```

Local workflow:

1. Add local-only values to `.env.local` at the repo root or `web/.env.local`.
2. Run `npm run test:marketing-email-smoke`.

Required environment variables:

- `SENDGRID_API_KEY`
- `EMAIL_FROM`
- `MARKETING_EMAIL_SMOKE_TEST_TO`
- `EMAIL_REPLY_TO` only if your environment normally requires it

The smoke script loads local env values automatically from existing `process.env`, repo-root `.env.local`, `web/.env.local`, and their `.env` counterparts before checking configuration.

The smoke test sends exactly one real plain-text email to `MARKETING_EMAIL_SMOKE_TEST_TO` with a unique timestamped subject in the form `Planner OS marketing smoke test - <timestamp>`.

If the required SendGrid or recipient env vars are missing, the smoke command exits cleanly with a skipped or not-configured message instead of failing.

## Deferred

- Preference-center UI and resubscribe state are not implemented.
- Total open/click counts are not displayed; current product counters are unique recipient milestones.
- Social, paid, web, and conversion analytics remain out of scope.
