"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreateLicenseModal } from "@/components/admin/create-license-modal";
import type {
  AdminLicenseEventOption,
  AdminLicenseExhibitorOption,
  AdminLicenseHostCompanyOption,
  AdminLicensePlanOption
} from "@/lib/data/admin-licenses-types";

type CompanyScopedCreateLicenseActionProps = {
  events: AdminLicenseEventOption[];
  exhibitors: AdminLicenseExhibitorOption[];
  companies: AdminLicenseHostCompanyOption[];
  hostCompanies: AdminLicenseHostCompanyOption[];
  licensePlans: AdminLicensePlanOption[];
};

export function CompanyScopedCreateLicenseAction({
  events,
  exhibitors,
  companies,
  hostCompanies,
  licensePlans
}: CompanyScopedCreateLicenseActionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:from-indigo-600 hover:to-violet-700"
      >
        + Add License
      </button>

      <CreateLicenseModal
        open={open}
        onClose={() => setOpen(false)}
        defaultEventId=""
        events={events}
        exhibitors={exhibitors}
        companyOptions={companies}
        hostCompanies={hostCompanies}
        licensePlans={licensePlans}
        initialScope="company"
        scopeLocked
        companyScopedSimple
        onCreated={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
