export const LEAD_RETRIEVAL_INTERNAL_HEALTH_PATHS = [
  "/api/internal/health/lead-retrieval/conversation-lifecycle",
  "/api/internal/health/lead-retrieval/capture-recording-ingestion",
  "/api/internal/health/lead-retrieval/workflow-waits",
  "/api/internal/health/lead-retrieval/access-readiness",
  "/api/internal/health/lead-retrieval/campaign-readiness",
  "/api/internal/health/lead-retrieval/invite-license-seat-access",
  "/api/internal/health/lead-retrieval/provider-failure-spikes",
  "/api/internal/health/lead-retrieval/job-cron-freshness"
] as const;

const LEAD_RETRIEVAL_INTERNAL_HEALTH_PATH_SET = new Set<string>(
  LEAD_RETRIEVAL_INTERNAL_HEALTH_PATHS
);

export function isLeadRetrievalInternalHealthPath(pathname: string) {
  return LEAD_RETRIEVAL_INTERNAL_HEALTH_PATH_SET.has(pathname);
}
