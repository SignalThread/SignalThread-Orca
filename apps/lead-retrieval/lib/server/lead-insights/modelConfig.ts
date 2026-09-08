import "server-only";

const DEFAULT_LEAD_INSIGHTS_OPENAI_MODEL = "gpt-4.1";

export function getLeadInsightsOpenAIModel(
  env: NodeJS.ProcessEnv = process.env
): string {
  return (
    String(env.LEAD_INSIGHTS_OPENAI_MODEL ?? "").trim() ||
    DEFAULT_LEAD_INSIGHTS_OPENAI_MODEL
  );
}
