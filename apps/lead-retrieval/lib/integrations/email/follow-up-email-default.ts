export type FollowUpEmailContext = {
  leadName?: string | null;
  eventName?: string | null;
  senderName?: string | null;
  companyName?: string | null;
};

function text(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function firstName(value: string | null | undefined) {
  return text(value).split(/\s+/)[0] || "there";
}

/** A conservative, editable one-to-one follow-up. Context is used only when supplied. */
export function buildDefaultFollowUpEmail(context: FollowUpEmailContext) {
  const eventName = text(context.eventName);
  const senderName = text(context.senderName);
  const companyName = text(context.companyName);
  const followUp = eventName
    ? `Thank you for connecting at ${eventName}. I’d be glad to continue the conversation.`
    : "Thank you for your time. I’d be glad to continue the conversation.";
  const signature = [senderName, companyName].filter(Boolean);

  return [
    `Hi ${firstName(context.leadName)},`,
    "",
    followUp,
    "",
    "Would you be open to a brief follow-up next week?",
    "",
    "Best,",
    ...signature
  ].join("\n");
}
