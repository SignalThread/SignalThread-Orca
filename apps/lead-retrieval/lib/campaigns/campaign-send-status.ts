/** Final campaign row status after a send batch (pure helper, safe for client/unit tests). */
export function resolveFinalCampaignStatus(input: {
  sent: number;
  failed: number;
  skippedNoEmail: number;
}): "sent" | "failed" {
  const { sent, failed, skippedNoEmail } = input;
  if (sent > 0 && failed === 0 && skippedNoEmail === 0) {
    return "sent";
  }
  return "failed";
}
