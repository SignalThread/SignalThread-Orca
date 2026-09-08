import type { AdminExhibitorLicenseStatus, AdminLicenseStatus } from "@/lib/data/admin-licenses-types";

type CurrencyFormatOptions = {
  maximumFractionDigits?: number;
};

export function formatCurrency(value: number, currency = "USD", options?: CurrencyFormatOptions) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2
  }).format(value);
}

export function formatPriceCents(priceCents: number, currency = "USD", options?: CurrencyFormatOptions) {
  return formatCurrency(Math.max(0, Number(priceCents ?? 0)) / 100, currency || "USD", options);
}

export function getSeatUsagePercent(seatsUsed: number, seatsTotal: number) {
  if (!seatsTotal) return 0;
  return Math.max(0, Math.min(100, Math.round((seatsUsed / seatsTotal) * 100)));
}

export function formatLicenseStatus(status: AdminLicenseStatus | AdminExhibitorLicenseStatus) {
  if (status === "active") return "Active";
  if (status === "trial") return "Trial";
  if (status === "none") return "None";
  return "Expired";
}
