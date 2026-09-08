/**
 * Pure derivation for the Completed / Post-Event state of the canonical
 * Event Workspace — the Phase 1 post-event and executive outcome product.
 *
 * Same honesty contract as the Live core: `null` inputs are unavailable
 * (never 0), final intelligence reuses the deterministic conversation
 * aggregation (full-event window, no trends — there is no baseline), the
 * executive snapshot contains only deterministic findings (no revenue, no
 * prior-event comparison, no free-text account inference), and every action
 * targets an existing workflow.
 */

import {
  aggregateConversationField,
  aggregateRepPatterns,
  type LiveCoachingCallout,
  type LiveConversationRow,
  type LiveInsightModule
} from "@/lib/events/event-workspace-live-core";

export type CompletedWorkspaceInput = {
  /** Full-event conversation window (joined through leads), or null on failure. */
  conversations: LiveConversationRow[] | null;
  totalConversationCount?: number | null;
  totalLeadCount: number | null;
  /** Canonical temperature splits; null when the queries failed. */
  hotLeadCount: number | null;
  warmLeadCount: number | null;
  coldLeadCount: number | null;
  /** Hot, not closed, no follow-up date — the honest "untouched high-priority" group. */
  hotNoFollowUpCount: number | null;
  openFollowUpCount: number | null;
  dueTodayFollowUpCount: number | null;
  overdueFollowUpCount: number | null;
  /** Open follow-ups strictly after the event-local current date. */
  scheduledFollowUpCount: number | null;
  /** Leads still in status 'new' — labeled exactly that (no "contacted" field exists). */
  stillNewCount: number | null;
  briefingCounts: { generated: number; approved: number } | null;
  /** Pending generated_drafts for this event; null when workflows are off or unavailable. */
  draftsPendingCount: number | null;
  hrefs: {
    hotLeads: string;
    hotNoFollowUp: string;
    followUpsDue: string;
    leads: string;
    campaigns: string | null;
    draftsReview: string | null;
  };
};

export type CompletedKpi = {
  key: "total_leads" | "hot_leads" | "follow_ups_open" | "briefs_approved";
  label: string;
  value: number | null;
  display: string;
  caption: string;
  href: string | null;
};

export type CompletedWhatMattersNow = {
  key: string;
  title: string;
  body: string;
  actionLabel: string | null;
  actionHref: string | null;
  tone: "action" | "wrapped";
};

export type FollowUpReadinessRow = {
  key: "hot_untouched" | "overdue" | "scheduled" | "still_new" | "drafts_ready";
  label: string;
  value: number;
  href: string | null;
};

export type ExecutiveSnapshotRow = {
  key: "strongest_finding" | "follow_up_gap" | "next_step";
  label: string;
  value: string;
  href: string | null;
};

export type TakeItFurtherAction = {
  key: "launch_campaign" | "review_drafts" | "review_hot_leads" | "open_leads";
  label: string;
  description: string;
  href: string;
};

export type CompletedWorkspace = {
  whatMattersNow: CompletedWhatMattersNow;
  kpis: CompletedKpi[];
  recapModules: LiveInsightModule[];
  followUpReadiness: FollowUpReadinessRow[] | null;
  executiveSnapshot: ExecutiveSnapshotRow[];
  coaching: LiveCoachingCallout[];
  takeItFurther: TakeItFurtherAction[];
  intelligenceCoverage: { analyzedCount: number; totalCount: number | null; isSampled: boolean } | null;
};

export function deriveCompletedWorkspace(input: CompletedWorkspaceInput): CompletedWorkspace {
  const conversations = input.conversations;
  const synthesizedCount =
    conversations?.filter(
      (row) => String(row.synthesis_status ?? "").trim().toLowerCase() === "completed"
    ).length ?? 0;

  /* ------------------------- Final intelligence recap ------------------------- */

  const recapDefs: Array<{
    key: LiveInsightModule["key"];
    title: string;
    description: string;
    field: "priority_themes" | "buying_signals" | "objections" | "competitors_mentioned";
  }> = [
    {
      key: "topics",
      title: "Conversation themes",
      description: "The threads that ran through this event's conversations.",
      field: "priority_themes"
    },
    {
      key: "buying_signals",
      title: "Buying signals",
      description: "Concrete intent captured in conversations.",
      field: "buying_signals"
    },
    {
      key: "objections",
      title: "Top objections",
      description: "The pushback that recurred most.",
      field: "objections"
    },
    {
      key: "competitors",
      title: "Competitor mentions",
      description: "Who attendees compared you against.",
      field: "competitors_mentioned"
    }
  ];

  const recapModules: LiveInsightModule[] = [];
  if (conversations !== null) {
    for (const def of recapDefs) {
      const rows = aggregateConversationField(conversations, def.field, synthesizedCount);
      if (rows.length > 0) {
        recapModules.push({
          key: def.key,
          title: def.title,
          description: def.description,
          rows,
          sampleSize: synthesizedCount
        });
      }
    }
  }

  const coaching = conversations === null ? [] : aggregateRepPatterns(conversations);
  const intelligenceCoverage = conversations === null ? null : {
    analyzedCount: synthesizedCount,
    totalCount: input.totalConversationCount ?? null,
    isSampled: input.totalConversationCount != null && input.totalConversationCount > conversations.length
  };

  /* --------------------------------- KPIs --------------------------------- */

  const followUpsOpen = input.openFollowUpCount;

  const kpis: CompletedKpi[] = [
    {
      key: "total_leads",
      label: "Total leads",
      value: input.totalLeadCount,
      display: input.totalLeadCount === null ? "—" : String(input.totalLeadCount),
      caption: input.totalLeadCount === null ? "unavailable right now" : "captured at this event",
      href: input.totalLeadCount === null ? null : input.hrefs.leads
    },
    {
      key: "hot_leads",
      label: "Hot leads",
      value: input.hotLeadCount,
      display: input.hotLeadCount === null ? "—" : String(input.hotLeadCount),
      caption:
        input.hotLeadCount === null
          ? "unavailable right now"
          : input.warmLeadCount !== null && input.coldLeadCount !== null
            ? `${input.warmLeadCount} warm · ${input.coldLeadCount} cold`
            : "marked hot",
      href: input.hotLeadCount === null ? null : input.hrefs.hotLeads
    },
    {
      key: "follow_ups_open",
      label: "Follow-ups open",
      value: followUpsOpen,
      display: followUpsOpen === null ? "—" : String(followUpsOpen),
      caption:
        followUpsOpen === null
          ? "unavailable right now"
          : `${input.overdueFollowUpCount ?? 0} overdue · ${input.dueTodayFollowUpCount ?? 0} due today · ${input.scheduledFollowUpCount ?? 0} scheduled ahead`,
      href: followUpsOpen === null ? null : input.hrefs.followUpsDue
    }
  ];

  if (input.briefingCounts !== null && input.briefingCounts.generated > 0) {
    kpis.push({
      key: "briefs_approved",
      label: "Briefs approved",
      value: input.briefingCounts.approved,
      display: `${input.briefingCounts.approved} of ${input.briefingCounts.generated}`,
      caption: "generated briefs approved",
      href: null
    });
  }

  /* --------------------------- Follow-up readiness --------------------------- */

  let followUpReadiness: FollowUpReadinessRow[] | null = null;
  if (
    input.hotNoFollowUpCount !== null ||
    input.overdueFollowUpCount !== null ||
    input.scheduledFollowUpCount !== null ||
    input.stillNewCount !== null ||
    input.draftsPendingCount !== null
  ) {
    followUpReadiness = [];
    if (input.hotNoFollowUpCount !== null) {
      followUpReadiness.push({
        key: "hot_untouched",
        label: "Hot leads with no follow-up scheduled",
        value: input.hotNoFollowUpCount,
        href: input.hotNoFollowUpCount > 0 ? input.hrefs.hotNoFollowUp : null
      });
    }
    if (input.overdueFollowUpCount !== null) {
      followUpReadiness.push({
        key: "overdue",
        label: "Follow-ups overdue",
        value: input.overdueFollowUpCount,
        href: input.overdueFollowUpCount > 0 ? input.hrefs.followUpsDue : null
      });
    }
    if (input.scheduledFollowUpCount !== null) {
      followUpReadiness.push({
        key: "scheduled",
        label: "Follow-ups scheduled ahead",
        value: input.scheduledFollowUpCount,
        href: null
      });
    }
    if (input.stillNewCount !== null) {
      followUpReadiness.push({
        key: "still_new",
        label: "Leads still marked new",
        value: input.stillNewCount,
        href: input.stillNewCount > 0 ? input.hrefs.leads : null
      });
    }
    if (input.draftsPendingCount !== null && input.hrefs.draftsReview) {
      followUpReadiness.push({
        key: "drafts_ready",
        label: "Drafts awaiting review",
        value: input.draftsPendingCount,
        href: input.draftsPendingCount > 0 ? input.hrefs.draftsReview : null
      });
    }
  }

  /* --------------------------- Executive snapshot --------------------------- */
  // Deterministic findings only. No pipeline dollars, no benchmarks, no
  // account inference from free text.

  const executiveSnapshot: ExecutiveSnapshotRow[] = [];
  const topTheme = recapModules.find((m) => m.key === "topics")?.rows[0] ?? null;
  if (topTheme) {
    executiveSnapshot.push({
      key: "strongest_finding",
      label: "Strongest finding",
      value: `“${topTheme.label}” came up in ${topTheme.conversationCount} conversations`,
      href: null
    });
  }
  if (input.hotNoFollowUpCount !== null && input.hotNoFollowUpCount > 0) {
    executiveSnapshot.push({
      key: "follow_up_gap",
      label: "Follow-up gap",
      value: `${input.hotNoFollowUpCount} hot ${input.hotNoFollowUpCount === 1 ? "lead has" : "leads have"} no follow-up scheduled`,
      href: input.hrefs.hotNoFollowUp
    });
  }
  if (executiveSnapshot.length > 0 && input.hrefs.campaigns) {
    executiveSnapshot.push({
      key: "next_step",
      label: "Commercial next step",
      value: "Launch the follow-up campaign while conversations are fresh",
      href: input.hrefs.campaigns
    });
  }

  /* ----------------------------- Take it further ----------------------------- */

  const takeItFurther: TakeItFurtherAction[] = [];
  if (input.hrefs.campaigns) {
    takeItFurther.push({
      key: "launch_campaign",
      label: "Launch follow-up campaign",
      description: "Draft and send outreach to captured leads.",
      href: input.hrefs.campaigns
    });
  }
  if (input.hrefs.draftsReview && (input.draftsPendingCount ?? 0) > 0) {
    takeItFurther.push({
      key: "review_drafts",
      label: `Review ${input.draftsPendingCount} ${input.draftsPendingCount === 1 ? "draft" : "drafts"}`,
      description: "Approve or reject generated follow-up drafts.",
      href: input.hrefs.draftsReview
    });
  }
  if (input.hotLeadCount !== null && input.hotLeadCount > 0) {
    takeItFurther.push({
      key: "review_hot_leads",
      label: "Review hot leads",
      description: "Work the highest-intent leads first.",
      href: input.hrefs.hotLeads
    });
  }
  takeItFurther.push({
    key: "open_leads",
    label: "Open Leads Intelligence",
    description: "Browse, filter, and work every captured lead.",
    href: input.hrefs.leads
  });

  /* --------------------------- What Matters Now --------------------------- */
  // Ladder: hot-without-follow-up → drafts awaiting review → overdue
  // follow-ups → strongest theme → neutral recap.

  let whatMattersNow: CompletedWhatMattersNow;
  if (input.hotNoFollowUpCount !== null && input.hotNoFollowUpCount > 0) {
    whatMattersNow = {
      key: "hot_untouched",
      title: `${input.hotNoFollowUpCount} hot ${input.hotNoFollowUpCount === 1 ? "lead is" : "leads are"} still waiting on a follow-up`,
      body: "The event wrapped, but the highest-intent leads have no follow-up scheduled. Every day they wait, they cool.",
      actionLabel: "Review hot leads",
      actionHref: input.hrefs.hotNoFollowUp,
      tone: "action"
    };
  } else if ((input.draftsPendingCount ?? 0) > 0 && input.hrefs.draftsReview) {
    whatMattersNow = {
      key: "drafts_pending",
      title: `${input.draftsPendingCount} follow-up ${input.draftsPendingCount === 1 ? "draft is" : "drafts are"} waiting for review`,
      body: "Generated drafts are ready. Review and send them while the conversations are still fresh.",
      actionLabel: "Review drafts",
      actionHref: input.hrefs.draftsReview,
      tone: "action"
    };
  } else if (input.overdueFollowUpCount !== null && input.overdueFollowUpCount > 0) {
    whatMattersNow = {
      key: "overdue",
      title: `${input.overdueFollowUpCount} follow-${input.overdueFollowUpCount === 1 ? "up is" : "ups are"} overdue`,
      body: "Scheduled follow-ups slipped past their date during the event. Clear the backlog first.",
      actionLabel: "Open follow-up queue",
      actionHref: input.hrefs.followUpsDue,
      tone: "action"
    };
  } else if (topTheme) {
    whatMattersNow = {
      key: "strongest_theme",
      title: `“${topTheme.label}” defined this event`,
      body: `It surfaced in ${topTheme.conversationCount} captured conversations. Carry it into your follow-up messaging.`,
      actionLabel: input.hrefs.campaigns ? "Launch follow-up campaign" : null,
      actionHref: input.hrefs.campaigns,
      tone: "wrapped"
    };
  } else {
    const parts: string[] = [];
    if (input.totalLeadCount !== null) {
      parts.push(`${input.totalLeadCount} ${input.totalLeadCount === 1 ? "lead" : "leads"}`);
    }
    if (input.hotLeadCount !== null) parts.push(`${input.hotLeadCount} hot`);
    whatMattersNow = {
      key: "wrapped",
      title: "This event has wrapped",
      body:
        parts.length > 0
          ? `${parts.join(", ")} captured. Follow-up is where it converts — keep working the list.`
          : "Follow-up is where it converts — keep working the list.",
      actionLabel: null,
      actionHref: null,
      tone: "wrapped"
    };
  }

  return {
    whatMattersNow,
    kpis,
    recapModules,
    followUpReadiness,
    executiveSnapshot,
    coaching,
    takeItFurther,
    intelligenceCoverage
  };
}
