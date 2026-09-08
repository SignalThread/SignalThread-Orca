export function isWorkflowsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_WORKFLOWS_ENABLED !== "false";
}
