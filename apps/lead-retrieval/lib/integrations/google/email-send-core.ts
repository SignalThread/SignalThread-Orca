/**
 * Compatibility exports for callers migrating from the original Google-only
 * send contract. Production orchestration now lives in integrations/email.
 */
export {
  sendEmailWithDependencies as sendGoogleFollowUpEmailWithDeps,
  type EmailSendDependencies as GoogleEmailSendDeps
} from "@/lib/integrations/email/send-core";
export type {
  EmailActivity as GoogleEmailActivity,
  EmailActivityStatus as GoogleEmailActivityStatus,
  EmailSafeErrorCategory as GoogleEmailSafeErrorCategory,
  EmailSendResult as GoogleEmailSendResult
} from "@/lib/integrations/email/types";
