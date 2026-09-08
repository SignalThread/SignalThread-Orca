"use client";

import type { AppRole } from "@/types/app";

export function PersonaToggle({
  role
}: {
  role: AppRole | null;
}) {
  const label =
    role === "platform_admin" || role === "organizer_admin"
      ? "Organizer Admin"
      : role === "exhibitor_admin"
        ? "Exhibitor admin"
        : role === "viewer"
          ? "App user"
          : "App user";

  return (
    <div className="inline-flex rounded-xl bg-accentSoft px-3 py-1.5 text-sm font-semibold text-accent shadow-sm">
      {label}
    </div>
  );
}
