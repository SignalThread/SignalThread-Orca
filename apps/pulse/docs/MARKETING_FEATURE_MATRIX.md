# Marketing Feature Matrix

Implementation-backed feature inventory for product marketing, sales enablement, and website copy.

Legend:

- `Live`: implemented and usable in current app surfaces
- `In progress`: present in codebase but partially implemented, placeholder-driven, or not fully productionized

## Core Platform Features


| Category        | Feature                                                     | Status | What it does                                                                                           | Why it matters                                                   | Business outcome                              |
| --------------- | ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------- |
| Voice Capture   | Branded kiosk consent + survey flow                         | Live   | Runs consent, question progression, audio recording, and completion in kiosk mode                      | Gives teams a polished, low-friction capture experience          | Improves response completion and data quality |
| Voice Capture   | Per-question voice recording with upload pipeline           | Live   | Captures audio per question, uploads to object storage, verifies object existence, confirms processing | Makes capture reliable in real-world kiosk conditions            | Reduces failed/partial submissions            |
| Voice Capture   | TTS question playback                                       | Live   | Plays prompts using server-generated TTS with cached audio URLs                                        | Improves accessibility and clarity in unattended flows           | Increases response quality                    |
| AI Processing   | OpenAI transcription                                        | Live   | Converts uploaded audio to transcript text                                                             | Turns voice data into searchable/analyzable content for analysis | Faster feedback review                        |
| AI Processing   | AI synopsis + sentiment analysis                            | Live   | Generates summary, sentiment score/label, themes, and action-style outputs                             | Converts unstructured feedback into decision-ready insight       | Shortens time-to-action                       |
| AI Processing   | Analysis fallback persistence                               | Live   | Stores fallback summary when AI analysis fails                                                         | Prevents blank downstream experiences                            | Improves reliability and continuity           |
| Analytics       | Event analytics dashboard                                   | Live   | Shows KPI cards, trend timeline, sentiment, themes, and recommendation context                         | Centralizes operational readouts                                 | Better management visibility                  |
| Analytics       | Deterministic signals (Pulse/Momentum/Friction/Opportunity) | Live   | Computes normalized operating signals over configurable windows                                        | Helps teams prioritize quickly without manual interpretation     | Clearer prioritization and faster decisions   |
| Analytics       | Insight drilldown with transcript evidence                  | Live   | Opens filterable drilldowns by sentiment/date/question/text with linked answers                        | Adds explainability to insights                                  | Increases trust and action confidence         |
| Survey Ops      | Survey creation and editing                                 | Live   | Supports create/edit flows, question management, and lifecycle controls                                | Enables non-technical ownership of feedback programs             | Faster launch and iteration                   |
| Survey Ops      | AI question creator                                         | Live   | quickly create questions using prompts                                                                 | Generate ideas for suervys                                       | Faster launch and iteration                   |
| Survey Ops      | Survey status controls                                      | Live   | Draft, activate, close, reopen, archive behavior with edit rules by status                             | Protects live survey integrity                                   | Lower operational risk                        |
| Distribution    | Kiosk launch through QR and URL distribution                | Live   | Launches kiosk URLs and downloads QR assets from dashboard and analytics surfaces                      | Simplifies on-site deployment                                    | Faster rollout across sites                   |
| Retail Growth   | Post-survey Google review helper                            | Live   | Generates customer-ready review text and routes to Google review URL                                   | Converts positive feedback moments into review intent            | Potential lift in review volume/reputation    |
| Confirmation UX | Generic thank-you summary screen                            | Live   | Shows completion confirmation and optional generated summary                                           | Keeps completion clean when no review link is configured         | Better respondent experience                  |


## Admin, Operational, and Platform Features


| Category         | Feature                                            | Status | What it does                                                                                | Why it matters                                      | Business outcome                            |
| ---------------- | -------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------- |
| Multi-Tenant Ops | Account → Location hierarchy                       | Live   | Scopes surveys, responses, and analytics by tenant and location                             | Supports multi-site customer structures             | Scalable expansion beyond single location   |
| Branding & UX    | Branding controls with logo + colors               | Live   | Supports logo upload and color settings with preview context                                | Aligns kiosk experience to brand standards          | Higher trust and brand consistency          |
| Branding & UX    | Consent screen editor                              | Live   | Edits title/subtitle/items/button text shown in kiosk consent                               | Keeps legal/UX messaging configurable               | Better compliance and onboarding clarity    |
| Location Ops     | Location management                                | Live   | Create/edit/delete locations and set Google review URL per location                         | Enables distributed operations setup                | Cleaner local rollout management            |
| Team Access      | User invites and role assignment                   | Live   | Invites account users, manages roles, pending invites, resend/revoke, remove/restore access | Enables secure collaboration across teams           | Better governance and adoption              |
| Auth             | OTP login + account linking flow                   | Live   | Uses Supabase auth with account linking via pending provisioning                            | Simplifies secure access without password workflows | Faster user onboarding                      |
| Billing          | Stripe checkout and billing portal                 | Live   | Supports plan checkout, webhook activation, and self-service billing portal                 | Connects product use to subscription lifecycle      | Simplified billing                          |
| Enablement       | Help page with walkthrough panel, quick-start, FAQ | Live   | Centralized support content under `/help` and `/app/help`                                   | Improves self-serve learning                        | Faster activation and fewer support tickets |
| Onboarding       | Guided product tour                                | Live   | Manual launch from settings menu plus auto-start toggle behavior                            | Guides first-time users through key flows           | Higher feature discovery and activation     |


## Integrations and Infrastructure


| Category     | Feature                              | Status | What it does                                                                                    | Why it matters                                 | Business outcome                      |
| ------------ | ------------------------------------ | ------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------- |
| Storage      | S3-compatible object storage support | Live   | Supports S3/R2/MinIO patterns for uploads, HEAD verification, and media retrieval               | Keeps media pipeline provider-flexible         | Easier deployment across environments |
| AI Providers | OpenAI Whisper/Chat/TTS integration  | Live   | Handles transcription, analysis, and speech synthesis                                           | Powers full voice-to-insight loop              | Differentiated product value          |
| Auth Infra   | Supabase client + admin patterns     | Live   | Supports user session auth and service-role invitation flows                                    | Enables passwordless login + invite management | Faster, lower-friction user access    |
| Data Layer   | Prisma-backed relational model       | Live   | Persists account, location, event, response, answer, transcript, analysis, and insight entities | Supports traceable analytics and product ops   | Reliable reporting and product scale  |


## Standout Differentiators (Implementation Confirmed)

1. End-to-end voice feedback stack in one workflow: capture, upload, transcribe, analyze, and operationalize.
2. Deterministic signal framework (Pulse, Momentum, Friction, Opportunity) plus source-answer traceability.
3. Multi-tenant operational model with account/location/event scoping and role-aware team controls.
4. Dual onboarding motion: self-serve billing entry and platform-admin provisioning for higher-touch deployments.

