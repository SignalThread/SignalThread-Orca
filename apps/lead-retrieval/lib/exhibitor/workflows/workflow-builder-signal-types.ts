/**
 * Client-safe signal row shape for the exhibitor workflow builder.
 */

export type WorkflowBuilderSignalOption = {
  id: string;
  name: string;
  /** Campaign Agent category — drives grouping in the inspector. */
  category: string;
};
