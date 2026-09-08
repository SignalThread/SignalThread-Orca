import type { EnrichmentPhase } from "@/lib/import-wizard/enrichment-run";

/**
 * Single rule: enrichment output is only "current" when it was produced at the same
 * `import_batches.data_revision` as the batch the client considers active.
 */
export function isEnrichmentOutputStaleForBatch(args: {
  enrichmentPhase: EnrichmentPhase;
  enrichmentRunResult: unknown;
  enrichmentRunAtDataRevision: number | null;
  currentBatchDataRevision: number;
}): boolean {
  return (
    args.enrichmentPhase === "succeeded" &&
    args.enrichmentRunResult != null &&
    (args.enrichmentRunAtDataRevision === null ||
      args.enrichmentRunAtDataRevision !== args.currentBatchDataRevision)
  );
}
