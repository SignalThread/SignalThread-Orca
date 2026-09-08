# Legacy mobile (lead-intel-scan) migrations — reference copy

Verbatim copies of `~/Documents/lead-intel-scan/supabase/migrations/*.sql` at commit `891dabf`
(the shipped Lead Retrieval mobile app), captured 2026-09-07 for schema reconciliation.

They are **evidence, not a deployment mechanism**. They are never executed by this app. The
canonical schema is `supabase/migrations/<timestamp>_lead_retrieval_clean_baseline.sql`; how each
of these files maps into it is recorded in `docs/LR_CANONICAL_SCHEMA_RECONCILIATION.md`.
The mobile repository itself was not modified.
