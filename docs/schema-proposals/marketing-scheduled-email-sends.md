# Marketing Scheduled Email Sends

## Goal

Add real scheduled email lifecycle state for the existing Marketing email send model without adding webhook analytics or fake performance metrics.

## Existing Coverage

`MarketingEmailSend` already stores:

- `scheduledSendAt` for the target scheduled time
- `actualSentAt` for provider-accepted send time
- `status` with `DRAFT`, `SCHEDULED`, `SENDING`, `SENT`, `FAILED`, and existing `CANCELED`
- `recipientCount`
- `sendgridBatchId`

`MarketingEmailSendRecipient` already stores the frozen per-send recipient snapshot and provider status.

## Additive Fields

Add the following columns to `MarketingEmailSend`:

- `canceledAt DateTime?`
- `canceledByUserId String? @db.Uuid`
- `failureReason String? @db.Text`
- `sendAttemptCount Int @default(0)`
- `lastAttemptedAt DateTime?`

These fields let the service record cancellation, failed runner/provider attempts, and safe retry state.

## Lifecycle

The persisted status enum keeps the existing database spelling `CANCELED`; UI can display “Cancelled”.

Allowed lifecycle:

- `DRAFT` can be edited, scheduled, or sent now.
- `SCHEDULED` has frozen recipients and can be cancelled or rescheduled.
- `SENDING` is claimed by the server runner or send-now path.
- `SENT` means the provider accepted every recipient in the batch.
- `PARTIALLY_SENT` remains supported for send-now/provider partial success.
- `FAILED` stores `failureReason` and can be retried using the frozen snapshot.
- `CANCELED` is historical and must not be sent by the runner.

## Migration

The migration is additive only: no enum rename, table rename, data deletion, or analytics/webhook ingestion.
