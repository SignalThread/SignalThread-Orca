export type AdminLicenseStatus = "active" | "trial" | "expired";

export type AdminLicenseScope = "event" | "company";

export type AdminLicenseBilling = "one_time" | "monthly";

export type AdminLicenseBillingSource = "internal" | "stripe" | "app_store" | "google_play";

export type AdminExhibitorLicenseStatus = "active" | "expired" | "none";

export type AdminLicenseEventOption = {
  id: string;
  name: string;
  /**
   * Owning company id (events.company_id). Used by the licenses list filter to recognize
   * direct-buyer companies that own the event (no exhibitors row) so their company-scoped
   * licenses still appear when the event is selected. Never read for access at runtime.
   */
  companyId: string | null;
};

export type AdminLicenseExhibitorOption = {
  id: string;
  /** Empty when the buyer company exists without an `exhibitors` row (company-scoped / direct). */
  eventId: string;
  companyId: string;
  name: string;
};

export type AdminLicenseHostCompanyOption = {
  id: string;
  name: string;
};

export type AdminLicensePlanOption = {
  id: string;
  code: string;
  name: string;
  defaultTermMonths: number;
};

export type AdminLicenseRow = {
  id: string;
  licenseKey: string;
  /** Null for company-scoped licenses (no single event). */
  eventId: string | null;
  eventName: string | null;
  scope: AdminLicenseScope;
  billing: AdminLicenseBilling;
  billingSource: AdminLicenseBillingSource;
  companyId: string;
  exhibitorCompanyId: string;
  exhibitorName: string;
  licensePlanId: string | null;
  licensePlanCode: string | null;
  licensePlanName: string | null;
  termMonths: number | null;
  seatsTotal: number;
  seatsUsed: number;
  status: AdminLicenseStatus;
  startsAt: string | null;
  expiresAt: string;
  priceCents: number;
  currency: string;
  createdAt: string;
};

export type AdminLicensesPageData = {
  events: AdminLicenseEventOption[];
  exhibitors: AdminLicenseExhibitorOption[];
  /** Distinct event host companies — required to bill company-scoped licenses. */
  hostCompanies: AdminLicenseHostCompanyOption[];
  licensePlans: AdminLicensePlanOption[];
  licenses: AdminLicenseRow[];
  /**
   * First event (for Create License modal when the UI filter is “All Events”).
   * Not used to scope the licenses query (that list is always global).
   */
  defaultEventId: string;
};
