import "server-only";

import {
  listEmailActivitiesForLead,
  sendFollowUpEmail
} from "@/lib/integrations/email/send-service";

/** @deprecated Use the provider-neutral email service. Kept for route compatibility. */
export const sendGoogleFollowUpEmail = sendFollowUpEmail;

/** @deprecated Use the provider-neutral email activity reader. */
export const listGoogleEmailActivitiesForLead = listEmailActivitiesForLead;
