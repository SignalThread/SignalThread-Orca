import type { SignalCategory } from "@/components/signals/signal-types";

export type StarterTemplate = {
  id: string;
  title: string;
  description: string;
  example: string;
  prefills: {
    name: string;
    default_prompt: string;
  };
};

export const STARTER_TEMPLATES_BY_CATEGORY: Record<SignalCategory, StarterTemplate[]> = {
  "AI-Powered": [
    {
      id: "ai-strategic-angle",
      title: "Positioning Agent",
      description: "Frames outreach around a clear strategic narrative tied to the prospect’s priorities.",
      example: "Use when you want the email to open with a sharp point of view before the ask.",
      prefills: {
        name: "Positioning Agent",
        default_prompt:
          "Using the highlights uncovered from the recorded conversation, write a concise strategic angle for outreach. Focus on the prospect’s stated priorities, pain points, goals, objections, and business context. Frame it as a clear reason to follow up, not a generic summary."
      }
    },
    {
      id: "ai-personalized-opener",
      title: "Personalized Opener",
      description: "Opens with a tailored hook based on role, company, and recent context.",
      example: "Best for first-touch emails where relevance must be obvious in the first line.",
      prefills: {
        name: "Personalized Opener",
        default_prompt:
          "Open with one line that ties the prospect’s title, company, and any known context (event, industry, initiative). Transition naturally into the reason for outreach without sounding templated."
      }
    },
    {
      id: "ai-pain-point-summary",
      title: "Pain Point Summary",
      description: "Summarizes the likely challenge so the prospect feels understood quickly.",
      example: "Use when discovery has surfaced a problem you can name crisply.",
      prefills: {
        name: "Pain Point Summary",
        default_prompt:
          "State the prospect’s likely pain in plain language, grounded in their role and sector. Show you understand constraints (time, budget, risk). Bridge to how a short conversation could help."
      }
    },
    {
      id: "ai-value-hypothesis",
      title: "Value Hypothesis",
      description: "States a testable hypothesis about value you can deliver.",
      example: "Works well when you want a credible, consultative tone.",
      prefills: {
        name: "Value Hypothesis",
        default_prompt:
          "Offer a short value hypothesis: what you believe is going wrong, what you’d validate on a call, and what outcome you’d aim for. Invite correction—sound curious, not presumptuous."
      }
    },
    {
      id: "ai-executive-angle",
      title: "Executive Angle",
      description: "Compresses the message for senior readers: outcome, risk, and next step.",
      example: "Use for VP+ titles where brevity and business outcomes matter most.",
      prefills: {
        name: "Executive Angle",
        default_prompt:
          "Write for an executive reader: lead with business outcome, quantify impact if possible, acknowledge risk of status quo, propose a concrete next step with a time-bound ask."
      }
    }
  ],
  Contextual: [
    {
      id: "ctx-company",
      title: "Company Intel Agent",
      description: "Grounds the message in firmographic and situational company facts.",
      example: "Use when company size, growth, or structure changes how you position.",
      prefills: {
        name: "Company Intel Agent",
        default_prompt:
          "Incorporate accurate company context: industry, size cues, and public facts where available. Use this block to personalize without repeating the lead’s name unnecessarily."
      }
    },
    {
      id: "ctx-industry",
      title: "Industry Context",
      description: "Adds sector-specific language and typical priorities.",
      example: "Helps when the same product spans multiple verticals.",
      prefills: {
        name: "Industry Context",
        default_prompt:
          "Reflect industry norms: regulatory pressure, common KPIs, and seasonal rhythms for this sector. Keep jargon minimal unless the reader expects it."
      }
    },
    {
      id: "ctx-event",
      title: "Event Relevance",
      description: "Ties the message to the event, booth, or session context.",
      example: "Ideal for post-event follow-up while memory is fresh.",
      prefills: {
        name: "Event Relevance",
        default_prompt:
          "Reference the event name, timing, and any booth or session context. Connect what they saw or signed up for to a natural reason to continue the conversation."
      }
    },
    {
      id: "ctx-persona",
      title: "Persona Context",
      description: "Shapes tone and priorities for the contact’s role persona.",
      example: "Use when the same offer must read differently for IC vs. manager vs. exec.",
      prefills: {
        name: "Persona Context",
        default_prompt:
          "Adapt to the persona implied by title and seniority: an IC cares about day-to-day workflow; a manager about team metrics; an executive about risk, ROI, and speed."
      }
    },
    {
      id: "ctx-product-fit",
      title: "Product Fit Background",
      description: "Explains why your solution fits this account without a hard pitch.",
      example: "Supports discovery-stage emails focused on fit, not features.",
      prefills: {
        name: "Product Fit Background",
        default_prompt:
          "Summarize product–account fit in one short paragraph: relevant use cases, adjacent customers if appropriate, and what you’d clarify on a call. Avoid feature dumps."
      }
    }
  ],
  Custom: [
    {
      id: "cust-social-proof",
      title: "Social Proof Block",
      description: "Inserts a credible proof point such as logo, metric, or short quote.",
      example: "Use when trust must be established before the ask.",
      prefills: {
        name: "Social Proof Block",
        default_prompt:
          "Add a compact social proof line: recognizable customer, measurable outcome, or third-party validation. Keep it factual and easy to scan."
      }
    },
    {
      id: "cust-product-value",
      title: "Product Value Statement",
      description: "States what the product does for this reader in one clear sentence.",
      example: "Use as a reusable block near the middle of the message.",
      prefills: {
        name: "Product Value Statement",
        default_prompt:
          "State the product value in one sentence tied to the reader’s role. Focus on outcome, not internal feature names. Optional second sentence for scope if needed."
      }
    },
    {
      id: "cust-objection",
      title: "Objection Handling Snippet",
      description: "Addresses a common concern without being defensive.",
      example: "Deploy when you know timing, budget, or priority objections appear.",
      prefills: {
        name: "Objection Handling Snippet",
        default_prompt:
          "Acknowledge a likely objection (timing, budget, competing priorities). Respond with a short, calm reframe and a low-friction way to move forward."
      }
    },
    {
      id: "cust-brand-positioning",
      title: "Brand Positioning Copy",
      description: "Positions your brand voice consistently in the email body.",
      example: "For teams with a defined voice that must stay on-brand.",
      prefills: {
        name: "Brand Positioning Copy",
        default_prompt:
          "Reinforce brand positioning in one or two sentences: who you help, what you stand for, and how you differ from generic alternatives. Match approved brand tone."
      }
    },
    {
      id: "cust-credibility",
      title: "Credibility Paragraph",
      description: "Builds trust with credentials, tenure, or scope.",
      example: "Use early when the sender or company is unknown to the prospect.",
      prefills: {
        name: "Credibility Paragraph",
        default_prompt:
          "Provide a brief credibility paragraph: relevant experience, geography, or customer footprint. Keep it factual and proportionate—avoid hype."
      }
    }
  ],
  "Call-to-Action": [
    {
      id: "cta-book-meeting",
      title: "Book a Meeting",
      description: "Clear ask to schedule time with a specific duration or tool.",
      example: "Standard close for discovery or demo booking.",
      prefills: {
        name: "Book a Meeting",
        default_prompt:
          "Close with a direct meeting ask: suggest a 15–20 minute slot, offer a calendar link or reply-to-book, and state what will be covered. Keep the ask single and obvious."
      }
    },
    {
      id: "cta-continue",
      title: "Continue the Conversation",
      description: "Soft continuation ask for threads already in motion.",
      example: "After an event chat or inbound reply.",
      prefills: {
        name: "Continue the Conversation",
        default_prompt:
          "Invite the prospect to continue the thread with a specific question or topic. Offer to share a short resource if helpful. Avoid pressure; emphasize convenience."
      }
    },
    {
      id: "cta-schedule-demo",
      title: "Schedule a Demo",
      description: "Structured ask for a product demonstration.",
      example: "When the buyer is evaluating solutions actively.",
      prefills: {
        name: "Schedule a Demo",
        default_prompt:
          "Ask for a demo with a suggested agenda tailored to their role. Mention duration and whether it’s live or recorded. One clear CTA button or reply path."
      }
    },
    {
      id: "cta-reply-interest",
      title: "Reply with Interest",
      description: "Low-commitment reply-based CTA.",
      example: "When calendar friction should be minimized.",
      prefills: {
        name: "Reply with Interest",
        default_prompt:
          "Ask for a simple reply indicating interest or timing. Offer an opt-out. Keep the request one sentence and easy to answer on mobile."
      }
    },
    {
      id: "cta-visit-booth",
      title: "Visit Booth / Stop By",
      description: "Event-specific foot traffic or booth visit ask.",
      example: "During or immediately before the show.",
      prefills: {
        name: "Visit Booth / Stop By",
        default_prompt:
          "Invite the prospect to visit the booth or a named location: include hall or stand reference if known, hours, and what they’ll see. Keep directions scannable."
      }
    }
  ]
};

export function findStarterTemplate(
  category: SignalCategory,
  templateId: string
): StarterTemplate | undefined {
  return STARTER_TEMPLATES_BY_CATEGORY[category].find((t) => t.id === templateId);
}
