# Google provider test tiers

> Prompt 10 item 1, plan §76. **This assignment is a prerequisite, not documentation** —
> §§45–47 specify roughly 120 provider cases and implicitly assume they run live. Against
> real Google that is slow, rate-limited, quota-bound and flaky, and it will be the first
> thing the team disables.
>
> Every case below carries a declared tier. A case with no tier does not get written.

## The tiers

| Tier | What it runs against | Cadence | Runner category |
|---|---|---|---|
| **Tier 1 — recorded replay** | Pure logic and recorded HTTP fixtures. No network. | every commit | `local-only` |
| **Tier 2 — live sandbox** | A dedicated Google Workspace test domain with owned accounts. | nightly | `prod-safe` |
| **Tier 3 — production canary** | Production, sending only to owned test mailboxes. | post-deploy | `prod-safe`, `prodWrites=true` |

**Fixture drift job** (§76): re-record Tier 1 fixtures on a schedule and diff against the
committed set. Without it, recorded fixtures test our 2026 assumptions forever and a silent
Google API change stays invisible until a customer finds it. Owned by Prompt 14.

## Status of each tier in this run

| Tier | Status |
|---|---|
| Tier 1 | **Built.** Cases written and passing. |
| Tier 2 | **Not available.** No sandbox Workspace domain is configured. Recorded as LR-INF-003, not treated as a blocker (Brief §10). |
| Tier 3 | **Deferred — live customer event.** Tagged `prodWrites=true` and routed to not-run by the runner's live-event guard. See LR-DEFER-001. |

## Assignment

### §45 — OAuth and connection security lifecycle

| Case | Tier | Rationale |
|---|:---:|---|
| State token creation, signature, TTL | 1 | Pure crypto over a signed payload |
| State tampering rejected | 1 | Pure |
| PKCE pair generation and verifier/challenge relationship | 1 | Pure |
| PKCE mismatch rejected | 1 | Pure |
| `returnTo` normalization / open-redirect rejection | 1 | Pure |
| Launch ticket: expired, reused, malformed, mismatched | 1 | Pure over a signed ticket |
| Callback replay | 1 | Replay is a property of the state/ticket, not of Google |
| No bearer in any browser URL, log or client payload | 1 | Assertable over the constructed URL and payload |
| Access-token expiry → refresh | 1 | `token-manager-core` is dependency-injected |
| Refresh race → single-owner lease | 1 | Injected deps; the lease is ours, not Google's |
| Invalid/revoked refresh token → `reconnect_required` | 1 | Injected deps |
| Encryption key ID missing or rotated out | 1 | Ours entirely |
| Decryption fails for a subset of credentials | 1 | Ours entirely |
| Initial connect, consent granted | 2 | Needs real consent |
| Cancel consent / denied scope / partial scope | 2 | Needs real consent |
| Wrong Google account selected | 2 | Needs real account switching |
| Provider-side revocation | 2 | Needs a real revoke |
| Provider outage during callback | 1 | Recorded fixture; do not wait for a real outage |
| Account-context switch during OAuth | 2 | Multi-actor browser flow |
| Mobile browser/app return | 2 | Requires the device leg |

### §46 — Email provider contract

| Case | Tier | Rationale |
|---|:---:|---|
| MIME construction: From, To, Subject encoding | 1 | Pure |
| Body line-break preservation (CRLF) | 1 | Pure — and the historical defect |
| Unicode subject and body | 1 | Pure |
| HTML and plain-text alternative equivalence | 1 | Pure |
| Header injection via subject or address rejected | 1 | Pure, and security-relevant |
| Provider message ID persisted | 1 | Recorded fixture |
| Timeout **before** provider acceptance | 1 | Recorded fixture |
| Timeout **after** acceptance → unknown outcome | 1 | Prompt 3 seam produces this on demand |
| Duplicate send request → idempotent | 1 | Ours |
| Rate limit (429) handling | 1 | Recorded fixture |
| Accepted-by-LR vs accepted-by-provider vs delivered vs failed | 1 | State machine is ours |
| Real mailbox receipt | 2 | Only a real mailbox proves delivery |
| Sent-mailbox behaviour | 2 | Real Gmail state |
| Bounce classification | 2 | Requires a real bounce |
| Post-deploy send to an owned mailbox | 3 | **Deferred — live event** |

### §47 — Calendar and availability

| Case | Tier | Rationale |
|---|:---:|---|
| Availability boundary inclusivity | 1 | Pure |
| Two-week scheduling horizon | 1 | Pure |
| **Afternoon-start regression** (a 2:30 PM request returns no earlier slots) | 1 | Pure — the named regression |
| Busy-window overlap and merging | 1 | Pure |
| Duration longer than the window | 1 | Pure |
| Timezone and DST handling | 1 | Pure, using the injectable clock |
| Suggestion limit and truncation reporting | 1 | Pure |
| Busy / free / tentative / out-of-office status | 1 | Recorded fixture |
| All-day and recurring events | 1 | Recorded fixture |
| Private event details hidden, busy time honoured | 2 | Needs a real private event |
| Primary vs secondary calendars | 2 | Needs real calendars |
| Selected calendar deleted | 2 | Needs real deletion |
| Meeting create / edit / cancel | 2 | Real Calendar writes |
| Duplicate create after timeout | 1 | Idempotency is ours; seam-driven |
| External deletion reconciliation | 2 | Needs a real external delete |
| Meet link creation | 2 | Real conferencing |
| Post-deploy meeting on an owned calendar | 3 | **Deferred — live event** |

### §16 / §47 — Follow-up

| Case | Tier | Rationale |
|---|:---:|---|
| Create / update / complete / clear | 1 | Service logic is dependency-injected |
| Private acting-user event: **no lead attendee, no conferencing** | 1 | Assertable over the constructed request |
| Update reuses the provider event ID | 1 | Ours |
| Partial success preserves LR state when Calendar fails | 1 | Seam-driven |
| Idempotent retries | 1 | Ours |
| Real calendar round-trip | 2 | Needs a real calendar |

## Counts

| Tier | Cases | Runs in this program |
|---|---:|---|
| Tier 1 | 41 | yes — every commit |
| Tier 2 | 16 | no — LR-INF-003, no sandbox domain |
| Tier 3 | 2 | no — deferred, live customer event |

**Tier 1 is 69% of the assigned cases.** That is the point of §76: the majority of provider
behaviour is our own state machine, not Google's, and it can run deterministically on every
commit.

## Rules

- **No secret in any assertion, fixture or log.** Fixtures store request/response shapes,
  never tokens. Asserted by the Prompt 13 leakage tests.
- **No Outlook or Microsoft cases.** Not implemented; Brief §2.
- A new §§45–47 case must be added to this table before it is written.
