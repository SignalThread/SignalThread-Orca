"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  clearImportWizardTransientSession,
  IMPORT_WIZARD_PATH_PREFIX,
} from "@/lib/import-wizard/wizard-transient-session";

/**
 * Clears tab-scoped wizard session flags when SPA navigation leaves the import wizard route.
 * Full page reload while staying on the wizard keeps sessionStorage (refresh preserves in-flow step).
 */
export function ImportWizardSessionTracker() {
  const pathname = usePathname();
  const prevPathname = useRef<string | null>(null);

  useEffect(() => {
    if (prevPathname.current === null) {
      prevPathname.current = pathname;
      return;
    }
    const wasOnWizard = prevPathname.current.startsWith(IMPORT_WIZARD_PATH_PREFIX);
    const nowOnWizard = pathname.startsWith(IMPORT_WIZARD_PATH_PREFIX);
    if (wasOnWizard && !nowOnWizard) {
      clearImportWizardTransientSession();
    }
    prevPathname.current = pathname;
  }, [pathname]);

  return null;
}
