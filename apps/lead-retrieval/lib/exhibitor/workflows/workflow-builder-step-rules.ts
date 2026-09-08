export type WorkflowBuilderInsertAnchor = "trigger" | "enrich";

export function deriveWorkflowBuilderAddStepState(params: {
  addAfter: WorkflowBuilderInsertAnchor;
  enrichLead: boolean;
  composeDraft: boolean;
  crmPushEnabled: boolean;
  signalsStageEnabled: boolean;
}) {
  const { addAfter, enrichLead, composeDraft, crmPushEnabled, signalsStageEnabled } = params;
  const afterTrigger = addAfter === "trigger";
  const canEnrich = afterTrigger && !enrichLead;
  const canComposeAfterTrigger = afterTrigger && (!composeDraft || crmPushEnabled);
  const canComposeAfterEnrich = addAfter === "enrich" && enrichLead && (!composeDraft || crmPushEnabled);
  const crmAlreadyTerminal = crmPushEnabled && !composeDraft;
  const canAddCrmFromModal = !crmAlreadyTerminal;

  return {
    canEnrich,
    canComposeAfterTrigger,
    canComposeAfterEnrich,
    canAddCrmFromModal,
    canAddSignalsStage: !signalsStageEnabled
  };
}
