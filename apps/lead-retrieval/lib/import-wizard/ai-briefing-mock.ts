/**
 * Mock AI briefing queue + structured content (replace with API data later).
 * Provider-agnostic copy — no implied third-party brands.
 */

export type BriefingQueueItem = {
  id: string;
  personName: string;
  title: string;
  company: string;
};

export const MOCK_BRIEFING_QUEUE: readonly BriefingQueueItem[] = [
  { id: "b1", personName: "Elena Rodriguez", title: "VP of Product", company: "NexaFlow" },
  { id: "b2", personName: "Alexander Pierce", title: "Head of Sales", company: "TechCorp" },
  { id: "b3", personName: "Sarah Jenkins", title: "CTO", company: "Vortex Labs" },
  { id: "b4", personName: "Michael Chen", title: "Senior Analyst", company: "Global Dynamics" },
];

export type BriefingDetail = {
  id: string;
  headline: string;
  companySnapshot: {
    name: string;
    tagline: string;
    quote: string;
    headcount: string;
    techSophistication: string;
    hq: string;
  };
  whyHere: string[];
  talkingPoints: { title: string; detail: string }[];
  questionsToAsk: string[];
  competitorContext: string;
  signalsToWatch: string[];
  integrity: { label: string; profilePct: number; historyPct: number };
};

export const MOCK_BRIEFING_DETAILS: Record<string, BriefingDetail> = {
  b1: {
    id: "b1",
    headline: "Synthesized intelligence for Elena Rodriguez, VP of Product at NexaFlow.",
    companySnapshot: {
      name: "NexaFlow",
      tagline: "Enterprise workflow automation for regulated industries.",
      quote:
        "Recent platform expansion into multi-region orchestration; evaluating consolidation of legacy integration stacks.",
      headcount: "1,200+",
      techSophistication: "Advanced",
      hq: "San Francisco, CA",
    },
    whyHere: [
      "Viewed the solution overview for scaling workflow automation.",
      "Attended the session on data pipeline modernization.",
    ],
    talkingPoints: [
      {
        title: "Focus on consolidation",
        detail: "Frame around reducing tool sprawl and unifying audit trails across teams.",
      },
      {
        title: "Global rollout readiness",
        detail: "Ask about regional compliance requirements and staging plans for multi-region go-live.",
      },
    ],
    questionsToAsk: [
      "What is the current approval chain for new integrations in production?",
      "Which systems must stay on-prem vs cloud for the next fiscal year?",
    ],
    competitorContext:
      "Category includes workflow vendors with lighter compliance depth; differentiate on auditability and deployment control.",
    signalsToWatch: [
      "Engagement depth on security and residency topics in the last 30 days.",
      "Repeat visits to pricing and architecture content.",
    ],
    integrity: { label: "High precision brief", profilePct: 100, historyPct: 85 },
  },
  b2: {
    id: "b2",
    headline: "Synthesized intelligence for Alexander Pierce, Head of Sales at TechCorp.",
    companySnapshot: {
      name: "TechCorp",
      tagline: "B2B SaaS for operations teams.",
      quote: "Evaluating consolidation of sales tooling ahead of Q3 planning.",
      headcount: "420",
      techSophistication: "Intermediate",
      hq: "Austin, TX",
    },
    whyHere: ["Registered for the executive roundtable.", "Downloaded the ROI worksheet."],
    talkingPoints: [
      { title: "Pipeline visibility", detail: "Connect metrics story to leadership reporting needs." },
      { title: "Change management", detail: "Highlight training and rollout support." },
    ],
    questionsToAsk: ["Who owns budget for sales tooling this quarter?", "What is the timeline for vendor review?"],
    competitorContext: "Peers often lead with price; lead with time-to-value and admin simplicity.",
    signalsToWatch: ["Spike in team members viewing the same asset.", "Return visits within one week."],
    integrity: { label: "Standard brief", profilePct: 92, historyPct: 78 },
  },
  b3: {
    id: "b3",
    headline: "Synthesized intelligence for Sarah Jenkins, CTO at Vortex Labs.",
    companySnapshot: {
      name: "Vortex Labs",
      tagline: "Data infrastructure for growth-stage teams.",
      quote: "Prioritizing reliability and observability for the next platform release.",
      headcount: "180",
      techSophistication: "Advanced",
      hq: "Seattle, WA",
    },
    whyHere: ["Attended the technical deep dive.", "Viewed integration documentation."],
    talkingPoints: [
      { title: "Architecture fit", detail: "Emphasize APIs and webhook patterns they already use." },
      { title: "Operational burden", detail: "Address on-call and incident workflows explicitly." },
    ],
    questionsToAsk: ["What SLAs are non-negotiable for your team?", "How do you evaluate new vendors today?"],
    competitorContext: "Similar buyers compare on extensibility and support response times.",
    signalsToWatch: ["Multiple stakeholders from engineering on the account.", "Downloads of technical PDFs."],
    integrity: { label: "High precision brief", profilePct: 96, historyPct: 72 },
  },
  b4: {
    id: "b4",
    headline: "Synthesized intelligence for Michael Chen, Senior Analyst at Global Dynamics.",
    companySnapshot: {
      name: "Global Dynamics",
      tagline: "Analytics and reporting for distributed sales orgs.",
      quote: "Exploring ways to tighten lead routing and event follow-up.",
      headcount: "2,400+",
      techSophistication: "Intermediate",
      hq: "Chicago, IL",
    },
    whyHere: ["Visited the booth scheduling page.", "Opened two product comparison guides."],
    talkingPoints: [
      { title: "Event follow-up", detail: "Tie recommendations to speed of rep outreach after sessions." },
      { title: "Reporting clarity", detail: "Align to leadership dashboards they already review weekly." },
    ],
    questionsToAsk: ["How is event attribution tracked today?", "Which regions are piloting new tooling first?"],
    competitorContext: "Often compared to lighter point solutions with fewer workflow hooks.",
    signalsToWatch: ["Low engagement with deep content — prioritize concise next steps."],
    integrity: { label: "Standard brief", profilePct: 88, historyPct: 65 },
  },
};

export const MOCK_BRIEFING_QUEUE_IDS = MOCK_BRIEFING_QUEUE.map((b) => b.id);
