export const PLATFORM_INTEGRATION_TABS = [
  "All Providers",
  "Registration Providers"
] as const;

export type PlatformIntegrationTab = (typeof PLATFORM_INTEGRATION_TABS)[number];
export type PlatformIntegrationCategory = Exclude<PlatformIntegrationTab, "All Providers">;

export type PlatformRegistrationIntegrationItem = {
  id: string;
  provider: string;
  name: string;
  category: PlatformIntegrationCategory;
  description: string;
  helperText: string;
  status: "connected" | "configured" | "not_connected" | "planned" | "coming_soon";
  route: string | null;
  logoSrc: string;
};

export const PLATFORM_REGISTRATION_INTEGRATIONS: PlatformRegistrationIntegrationItem[] = [
  {
    id: "streampoint",
    provider: "streampoint",
    name: "Streampoint",
    category: "Registration Providers",
    description: "Sync registrants and badge data into SignalThread Lead Retrieval events.",
    helperText: "Primary v1 registration provider for event-level attendee and badge ingestion.",
    status: "not_connected",
    route: "/admin/integrations/streampoint",
    logoSrc: "/integrations/StreamPoint-Logo.png"
  },
  {
    id: "cvent",
    provider: "cvent",
    name: "Cvent",
    category: "Registration Providers",
    description: "Connect Cvent registration and attendee records to SignalThread Lead Retrieval events.",
    helperText: "Registration adapter planned for event-level registrant and badge import.",
    status: "coming_soon",
    route: null,
    logoSrc: "/integrations/cvent-logo.webp"
  },
  {
    id: "rainfocus",
    provider: "rainfocus",
    name: "RainFocus",
    category: "Registration Providers",
    description: "Map RainFocus event attendee and badge identity data into SignalThread Lead Retrieval.",
    helperText: "Registration adapter planned for event-level attendee sync.",
    status: "coming_soon",
    route: null,
    logoSrc: "/integrations/Rainfoucs-Logo.jpeg"
  },
  {
    id: "bizzabo",
    provider: "bizzabo",
    name: "Bizzabo",
    category: "Registration Providers",
    description: "Bring Bizzabo registrant and event identity data into SignalThread Lead Retrieval.",
    helperText: "Registration adapter planned for event-level setup and sync.",
    status: "coming_soon",
    route: null,
    logoSrc: "/integrations/Bizzabo-Logo.png"
  }
];
