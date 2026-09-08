# Legacy LR Admin migrations — historical evidence

The 107 migrations (plus `_archive/`) that accumulated in the standalone `lead-intel-admin`
repository through commit `0b922e5` (2026-09-02). They were moved out of the active migration
path on 2026-09-07 because they cannot rebuild production (four tables and two dozen columns
existed only in the live database) and because a new database is created from one clean
baseline instead: `supabase/migrations/<timestamp>_lead_retrieval_clean_baseline.sql`.

Retained for provenance and as fixtures for the regression tests that read migration SQL.
Mapping from every file here to the canonical baseline: `docs/LR_CANONICAL_SCHEMA_RECONCILIATION.md`.
