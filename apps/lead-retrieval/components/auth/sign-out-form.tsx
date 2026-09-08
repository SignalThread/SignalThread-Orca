"use client";

import { clearImportWizardTransientSession } from "@/lib/import-wizard/wizard-transient-session";

type SignOutFormProps = {
  className?: string;
  buttonClassName?: string;
  buttonLabel?: string;
};

/**
 * POST /auth/signout — clears tab-scoped import wizard session before navigation so stale
 * mid-flow state does not survive logout in the same browser tab.
 */
export function SignOutForm({
  className,
  buttonClassName,
  buttonLabel = "Sign out",
}: SignOutFormProps) {
  return (
    <form
      action="/auth/signout"
      method="post"
      className={className}
      onSubmit={() => clearImportWizardTransientSession()}
    >
      <button type="submit" className={buttonClassName}>
        {buttonLabel}
      </button>
    </form>
  );
}
