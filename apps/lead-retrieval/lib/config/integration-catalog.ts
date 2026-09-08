export const INTEGRATION_TABS = [
  "All Integrations",
  "CRMs",
  "Sales / Enrichment",
  "Marketing Automation",
  "Automation / Workflow",
  "Communications",
] as const;

export type IntegrationTab = (typeof INTEGRATION_TABS)[number];

export type IntegrationCategory = Exclude<IntegrationTab, "All Integrations">;

export type IntegrationProviderKey =
  | "salesforce"
  | "hubspot"
  | "pipedrive"
  | "microsoft_dynamics_365"
  | "apollo"
  | "zoominfo"
  | "people_data_labs"
  | "marketo"
  | "pardot"
  | "mailchimp"
  | "zapier"
  | "make"
  | "n8n"
  | "slack"
  | "microsoft_teams"
  | "google_workspace"
  | "microsoft_365";

export type IntegrationCatalogItem = {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  helperText: string;
  logoSrc: string;
  provider: IntegrationProviderKey;
  connectRoute?: string;
  manageRoute?: string;
  disconnectRoute?: string;
  connectLabel?: string;
  manageLabel?: string;
  implemented: boolean;
  actionKey?: "hubspot_oauth" | "salesforce_oauth";
  /** When true, supports default enrichment provider selection on the Integrations page. */
  isEnrichmentProvider?: boolean;
};

export const INTEGRATION_CATALOG: IntegrationCatalogItem[] = [
  {
    id: "salesforce",
    name: "Salesforce",
    category: "CRMs",
    description: "Sync captured leads from SignalThread Lead Retrieval into Salesforce.",
    helperText: "Connect Salesforce to automatically sync leads and streamline your sales process.",
    logoSrc: "/integrations/salesforce-logo.svg",
    provider: "salesforce",
    connectRoute: "/api/integrations/salesforce/connect",
    actionKey: "salesforce_oauth",
    manageRoute: "/admin/integrations/salesforce/setup",
    implemented: true,
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "CRMs",
    description: "Sync captured leads from SignalThread Lead Retrieval into HubSpot contacts.",
    helperText: "Connect HubSpot to automatically sync leads and streamline your sales process.",
    logoSrc: "/integrations/hubspot-logo.svg",
    provider: "hubspot",
    actionKey: "hubspot_oauth",
    implemented: true,
  },
  {
    id: "pipedrive",
    name: "Pipedrive",
    category: "CRMs",
    description: "Connect your Pipedrive CRM",
    helperText: "Securely authorize your company's Pipedrive account for future CRM workflows.",
    logoSrc: "/integrations/providers/pipedrive.svg",
    provider: "pipedrive",
    connectRoute: "/api/integrations/pipedrive/start",
    manageRoute: "/exhibitor/integrations/pipedrive",
    disconnectRoute: "/api/integrations/pipedrive/disconnect",
    connectLabel: "Connect Pipedrive",
    manageLabel: "Configure",
    implemented: true,
  },
  {
    id: "microsoft-dynamics-365",
    name: "Microsoft Dynamics 365",
    category: "CRMs",
    description: "Integrate with Microsoft Dynamics 365 CRM.",
    helperText: "Connect Microsoft Dynamics 365 to automatically sync leads and streamline your sales process.",
    logoSrc: "/integrations/providers/microsoft-dynamics-365.svg",
    provider: "microsoft_dynamics_365",
    implemented: false,
  },
  {
    id: "apollo",
    name: "Apollo",
    category: "Sales / Enrichment",
    description: "Enrich lead profiles via Apollo People Match and build prospect lists with Apollo People Search.",
    helperText:
      "Add your Apollo API key to connect. Set Apollo as your default enrichment provider if you want lead enrichment to use Apollo instead of People Data Labs. People Search is for net-new prospecting and does not return email or phone in results.",
    logoSrc: "/integrations/providers/apollo.svg",
    provider: "apollo",
    connectRoute: "/exhibitor/integrations/apollo",
    manageRoute: "/exhibitor/integrations/apollo",
    connectLabel: "Configure Apollo",
    manageLabel: "Manage Apollo",
    implemented: true,
    isEnrichmentProvider: true,
  },
  {
    id: "zoominfo",
    name: "ZoomInfo",
    category: "Sales / Enrichment",
    description: "Configure ZoomInfo with your organization's GTM API bearer token.",
    helperText:
      "Used for lead enrichment and pre-show intelligence. Paste your ZoomInfo GTM API bearer token on the settings page; it is stored per company and never shown again after save.",
    logoSrc: "/integrations/providers/zoominfo.svg",
    provider: "zoominfo",
    connectRoute: "/exhibitor/integrations/zoominfo",
    manageRoute: "/exhibitor/integrations/zoominfo",
    connectLabel: "Configure ZoomInfo",
    manageLabel: "Manage ZoomInfo",
    implemented: true,
  },
  {
    id: "people-data-labs",
    name: "People Data Labs",
    category: "Sales / Enrichment",
    description: "Enrich lead profiles with People Data Labs contact and company data.",
    helperText:
      "Add your API key to connect, then set People Data Labs as your default enrichment provider for lead profile enrichment.",
    logoSrc: "/integrations/people-data-labs.svg",
    provider: "people_data_labs",
    connectRoute: "/exhibitor/integrations/people-data-labs",
    manageRoute: "/exhibitor/integrations/people-data-labs",
    connectLabel: "Configure People Data Labs",
    manageLabel: "Manage People Data Labs",
    implemented: true,
    isEnrichmentProvider: true,
  },
  {
    id: "marketo",
    name: "Marketo",
    category: "Marketing Automation",
    description: "Integrate with Marketo for marketing automation.",
    helperText: "Connect Marketo to automatically sync leads and streamline your sales process.",
    logoSrc: "/integrations/providers/marketo.svg",
    provider: "marketo",
    implemented: false,
  },
  {
    id: "pardot",
    name: "Pardot",
    category: "Marketing Automation",
    description: "Connect Salesforce Pardot for B2B marketing automation.",
    helperText: "Connect Pardot to automatically sync leads and streamline your sales process.",
    logoSrc: "/integrations/providers/pardot.svg",
    provider: "pardot",
    implemented: false,
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    category: "Marketing Automation",
    description: "Sync leads to Mailchimp for email campaigns.",
    helperText: "Connect Mailchimp to automatically sync leads and streamline your sales process.",
    logoSrc: "/integrations/providers/mailchimp.svg",
    provider: "mailchimp",
    implemented: false,
  },
  {
    id: "zapier",
    name: "Zapier",
    category: "Automation / Workflow",
    description: "Send leads and conversation insights to any Zapier workflow using webhooks.",
    helperText: "Configure Zapier webhooks to route SignalThread Lead Retrieval activity into your automation workflows.",
    logoSrc: "/integrations/providers/zapier.svg",
    provider: "zapier",
    connectRoute: "/admin/integrations/zapier",
    manageRoute: "/admin/integrations/zapier",
    connectLabel: "Configure Zapier",
    manageLabel: "Configure Zapier",
    implemented: true,
  },
  {
    id: "make",
    name: "Make.com",
    category: "Automation / Workflow",
    description: "Send SignalThread Lead Retrieval data into Make.com scenarios.",
    helperText: "Configure a Make.com webhook and payload template for outbound lead automation.",
    logoSrc: "/integrations/providers/make.svg",
    provider: "make",
    connectRoute: "/exhibitor/integrations/make",
    manageRoute: "/exhibitor/integrations/make",
    connectLabel: "Set up Make.com",
    manageLabel: "Manage Make.com",
    implemented: true,
  },
  {
    id: "n8n",
    name: "n8n",
    category: "Automation / Workflow",
    description: "Send SignalThread Lead Retrieval data into n8n webhook workflows.",
    helperText: "Configure an n8n webhook and payload template for outbound lead automation.",
    logoSrc: "/integrations/providers/n8n.svg",
    provider: "n8n",
    connectRoute: "/exhibitor/integrations/n8n",
    manageRoute: "/exhibitor/integrations/n8n",
    connectLabel: "Set up n8n",
    manageLabel: "Manage n8n",
    implemented: true,
  },
  {
    id: "slack",
    name: "Slack",
    category: "Communications",
    description: "Get real-time lead alerts in Slack.",
    helperText: "Connect Slack to automatically sync leads and streamline your sales process.",
    logoSrc: "/integrations/slack.png",
    provider: "slack",
    implemented: false,
  },
  {
    id: "microsoft-teams",
    name: "Microsoft Teams",
    category: "Communications",
    description: "Receive lead notifications in Microsoft Teams.",
    helperText: "Connect Microsoft Teams to automatically sync leads and streamline your sales process.",
    logoSrc: "/integrations/microsoft-teams.png",
    provider: "microsoft_teams",
    implemented: false,
  },
  {
    id: "google-workspace",
    name: "Google Workspace",
    category: "Communications",
    description: "Connect your own Google account for personalized follow-up and meeting workflows.",
    helperText: "Authorize Gmail send and owned-calendar capabilities for your individual account.",
    logoSrc: "/integrations/google-workspace.png",
    provider: "google_workspace",
    connectRoute: "/api/exhibitor/integrations/google/connect",
    manageRoute: "/exhibitor/integrations/google-workspace",
    connectLabel: "Connect Google Workspace",
    manageLabel: "Manage Google Workspace",
    implemented: true,
  },
  {
    id: "microsoft-365",
    name: "Microsoft 365",
    category: "Communications",
    description: "Connect your own Microsoft 365 account for Outlook follow-up and meeting workflows.",
    helperText: "Authorize Outlook mail send and calendar management for your individual account.",
    logoSrc: "/integrations/outlook.png",
    provider: "microsoft_365",
    connectRoute: "/api/exhibitor/integrations/microsoft/connect",
    manageRoute: "/exhibitor/integrations/microsoft-365",
    connectLabel: "Connect Microsoft 365",
    manageLabel: "Manage Microsoft 365",
    implemented: true,
  },
];
