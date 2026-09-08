"use client";

import { ExhibitorLeadDetailToolbar } from "@/components/leads/exhibitor-lead-detail-toolbar";
import { LeadProfileToolbarProvider } from "@/components/leads/lead-profile-toolbar-context";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type LeadDetailTabId = "profile" | "insights" | "brief";

type Ctx = {
  setTab: (id: LeadDetailTabId) => void;
};

const LeadDetailTabContext = createContext<Ctx | null>(null);

export function useLeadDetailTabNavigation() {
  return useContext(LeadDetailTabContext);
}

export function ExhibitorLeadDetailTabs({
  leading,
  profile,
  insights,
  brief,
  toolbarEnrich,
  toolbarEmail,
  toolbarMeeting,
  toolbarPipedrive,
}: {
  /** Page navigation row rendered above the tab/action shell (e.g. back to list). */
  leading: ReactNode;
  profile: ReactNode;
  insights: ReactNode;
  brief: ReactNode;
  /** Primary action: enrichment (same row as tabs, right-aligned). */
  toolbarEnrich: ReactNode;
  /** Email action, with Gmail follow-up when the current user is connected. */
  toolbarEmail: ReactNode;
  /** One-to-one Google Calendar scheduling action. */
  toolbarMeeting: ReactNode;
  /** Pipedrive send/retry/synced control, shown only when Pipedrive is connected. */
  toolbarPipedrive?: ReactNode;
}) {
  const [tab, setTab] = useState<LeadDetailTabId>("profile");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = window.location.hash.replace(/^#/, "");
    if (h === "ai-brief") {
      setTab("brief");
    } else if (h === "lead-insights") {
      setTab("insights");
    } else if (h === "lead-profile") {
      setTab("profile");
    }
  }, []);

  const ctx = useMemo(() => ({ setTab }), []);
  const tabs = useMemo(
    () =>
      [
        { id: "profile" as const, label: "Profile", content: profile },
        { id: "insights" as const, label: "AI Conversation Insights", content: insights },
        { id: "brief" as const, label: "Pre-Show Brief", content: brief },
      ] satisfies ReadonlyArray<{ id: LeadDetailTabId; label: string; content: ReactNode }>,
    [profile, insights, brief]
  );

  const renderTabTrigger = useCallback(
    (item: { id: LeadDetailTabId; label: string }) => (
      <button
        key={item.id}
        type="button"
        onClick={() => setTab(item.id)}
        className={`relative inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-lg px-2 text-xs font-semibold transition-all sm:px-2.5 ${
          tab === item.id
            ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
            : "text-slate-500 hover:text-slate-800"
        }`}
      >
        {item.label}
      </button>
    ),
    [tab]
  );

  return (
    <LeadProfileToolbarProvider>
      <LeadDetailTabContext.Provider value={ctx}>
        <div className="flex w-full flex-col gap-2">
          <div className="flex w-full justify-start">{leading}</div>

          <div className="w-full rounded-2xl border border-slate-200/90 bg-slate-100/50 p-1.5 ring-1 ring-slate-200/60">
            <div className="flex min-h-9 flex-nowrap items-center justify-between gap-1.5 sm:gap-2">
              <div className="flex min-h-0 min-w-0 flex-1 flex-nowrap items-center gap-0.5">
                {tabs.map((item) => renderTabTrigger(item))}
              </div>
              <div className="flex shrink-0 items-center">
                <ExhibitorLeadDetailToolbar
                  enrichSlot={toolbarEnrich}
                  emailSlot={toolbarEmail}
                  meetingSlot={toolbarMeeting}
                  pipedriveSlot={toolbarPipedrive}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          {tabs.map((item) => (
            <section key={item.id} hidden={item.id !== tab}>
              {item.content}
            </section>
          ))}
        </div>
      </LeadDetailTabContext.Provider>
    </LeadProfileToolbarProvider>
  );
}
