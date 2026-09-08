"use client";

import { useState } from "react";
import { AddUserModal } from "@/components/admin/add-user-modal";
import type {
  AddUserInviteActionState,
  ExhibitorOverview,
  PlatformEvent
} from "@/lib/data/platform-admin";

type CompanyOption = {
  id: string;
  name: string;
};

type CompanyScopedInviteUserActionProps = {
  events: PlatformEvent[];
  exhibitors: ExhibitorOverview[];
  companies: CompanyOption[];
  activeCompanyLicensedCompanyIds: string[];
  addUserAction: (formData: FormData) => Promise<AddUserInviteActionState>;
};

export function CompanyScopedInviteUserAction({
  events,
  exhibitors,
  companies,
  activeCompanyLicensedCompanyIds,
  addUserAction
}: CompanyScopedInviteUserActionProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:from-indigo-600 hover:to-violet-700"
      >
        + Add User
      </button>

      <AddUserModal
        open={open}
        events={events}
        exhibitors={exhibitors}
        companies={companies}
        activeCompanyLicensedCompanyIds={activeCompanyLicensedCompanyIds}
        addUserAction={addUserAction}
        onClose={() => setOpen(false)}
        roleOptions={["exhibitor_admin", "exhibitor_viewer"]}
      />
    </>
  );
}
