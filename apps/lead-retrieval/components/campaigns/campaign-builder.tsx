"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmailSignalBlock } from "@/components/campaign/EmailSignalBlock";
import { SignalLibraryModal } from "@/components/signals/signal-library-modal";
import type { SignalRecord } from "@/components/signals/signal-types";
import {
  CATEGORY_CAMPAIGN_CHIP,
  CATEGORY_VISUALS,
  SignalCategoryGlyph
} from "@/components/signals/category-badge";
import {
  combineConversationSummaries,
  isAiSummarySignalName,
  normalizeConversationSummary
} from "@/lib/campaigns/ai-summary-signal";
import { orderedSelectedAudienceEntries } from "@/lib/campaigns/orderedSelectedAudienceLeads";
import {
  getRenderableSignalIds,
  normalizeSignalTokens,
  resolveSelectedSignalIdsFromTokens
} from "@/lib/campaigns/signal-source-of-truth";
import type { AppRole } from "@/types/app";
import { isHotLead } from "@/lib/leads/lead-business-rules";

type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "failed";
type CampaignMode = "single" | "group";

type AvailableLead = {
  id: string;
  full_name: string;
  email: string | null;
  company: string;
  event_name: string | null;
  role: string;
  company_size?: string | null;
  industry?: string | null;
  company_domain?: string | null;
  priority_score: number;
  temperature: string | null;
  follow_up_date: string | null;
};

type Recipient = {
  lead_id: string;
  name: string;
  company: string;
  event_name: string | null;
  role: string;
  rating: number;
  priority_score: number;
  follow_up_date: string | null;
  has_ai_summary?: boolean;
  latest_ai_summary?: string | null;
};

type CampaignMessage = {
  id: string;
  campaign_id: string;
  recipient_id: string;
  lead_id: string;
  full_name: string;
  email: string | null;
  event_name: string | null;
  job_title: string | null;
  subject: string | null;
  body_text: string | null;
  mode?: CampaignMode;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  created_at: string;
};

type GenerateDraftResponse = {
  generationMode?: CampaignMode;
  generatedCount?: number;
  requestedLeadCount?: number;
  missingLeadIds?: string[];
  messages?: CampaignMessage[];
  selectedSignalIds?: string[];
  groupDraft?: {
    subject?: string | null;
    body_text?: string | null;
    body_html?: string | null;
    updated_at?: string | null;
  };
  error?: string;
};

const DEFAULT_SUBJECT_LINE = "Following up from {{event}} - {{first_name}}";

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function dedupeLibrarySignalsById(signals: SignalRecord[]): SignalRecord[] {
  const map = new Map<string, SignalRecord>();
  for (const signal of signals) {
    if (!map.has(signal.id)) {
      map.set(signal.id, signal);
    }
  }
  return [...map.values()];
}

function toMessageMap(items: CampaignMessage[]) {
  return items.reduce<Record<string, CampaignMessage>>((acc, item) => {
    if (!acc[item.lead_id]) {
      acc[item.lead_id] = item;
    }
    return acc;
  }, {});
}

function priorityTag(priority: number) {
  if (priority >= 90) return "text-rose-600";
  if (priority >= 75) return "text-violet-600";
  return "text-slate-600";
}

function firstNameFromFullName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] || "there";
}

function resolveSubjectTemplate({
  subjectLineTemplate,
  fullName,
  eventName,
  omitPersonalName
}: {
  subjectLineTemplate: string;
  fullName: string;
  eventName?: string | null;
  omitPersonalName?: boolean;
}) {
  const safeFullName = fullName.trim() || "there";
  const safeEventName = eventName?.trim() || "our event";
  const sanitizedTemplate = omitPersonalName
    ? subjectLineTemplate
        .replace(/\s*[-–—,:]?\s*\{\{first_name\}\}/gi, "")
        .replace(/\{\{first_name\}\}/gi, "")
        .replace(/\s*[-–—,:]?\s*\{\{full_name\}\}/gi, "")
        .replace(/\{\{full_name\}\}/gi, "")
    : subjectLineTemplate;

  return sanitizedTemplate
    .replaceAll("{{first_name}}", firstNameFromFullName(safeFullName))
    .replaceAll("{{full_name}}", safeFullName)
    .replaceAll("{{event}}", safeEventName)
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

export function CampaignBuilder({
  campaignId,
  initialName,
  mode,
  status,
  initialSelectedSignalIds,
  initialSubjectLine,
  initialDraftSubject,
  initialDraftBodyText,
  viewerRole,
  availableLeads
}: {
  campaignId: string;
  initialName: string;
  mode: CampaignMode;
  status: CampaignStatus;
  initialSelectedSignalIds?: string[];
  initialSubjectLine?: string | null;
  initialDraftSubject?: string | null;
  initialDraftBodyText?: string | null;
  viewerRole: AppRole | null;
  availableLeads: AvailableLead[];
}) {
  const [campaignName, setCampaignName] = useState(initialName);
  const [subjectLine, setSubjectLine] = useState(initialSubjectLine?.trim() || DEFAULT_SUBJECT_LINE);
  const [patternDraftSubject, setPatternDraftSubject] = useState(initialDraftSubject?.trim() || "Following up from {{event}}");
  const [patternDraftBodyText, setPatternDraftBodyText] = useState(initialDraftBodyText?.trim() || "");
  const [selectedSignalIds, setSelectedSignalIds] = useState<string[]>(() =>
    normalizeSignalTokens(initialSelectedSignalIds)
  );
  const [librarySignals, setLibrarySignals] = useState<SignalRecord[]>([]);
  const [signalsModalOpen, setSignalsModalOpen] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [draftMessages, setDraftMessages] = useState<CampaignMessage[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [editableSubjectByLeadId, setEditableSubjectByLeadId] = useState<Record<string, string>>({});
  const [editableBodyByLeadId, setEditableBodyByLeadId] = useState<Record<string, string>>({});
  const [audienceSearch, setAudienceSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "hot" | "high" | "low">("all");
  const [emailFilter, setEmailFilter] = useState<"all" | "has" | "none">("all");
  /** When there are recipients, panel open = this flag. When selectedCount===0, section is always expanded (see audienceSectionOpen). */
  const [audienceExpanded, setAudienceExpanded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus>(status);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const router = useRouter();
  const [savingBuilderConfig, setSavingBuilderConfig] = useState(false);
  const [generationMode, setGenerationMode] = useState<CampaignMode>(mode);
  const hasMountedTemplateSubjectRef = useRef(false);
  const hasMountedPatternDraftRef = useRef(false);
  const previousSelectedCountRef = useRef(0);

  async function loadRecipients() {
    setLoadingRecipients(true);
    setError(null);

    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/recipients`, { cache: "no-store" });
      const payload = (await response.json()) as { recipients?: Recipient[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load recipients");
      }
      console.log("CAMPAIGN_BUILDER_RECIPIENT_FETCH", {
        campaignId,
        recipientCount: payload.recipients?.length ?? 0,
        payload
      });
      setRecipients(payload.recipients ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load recipients");
    } finally {
      setLoadingRecipients(false);
    }
  }

  async function loadMessages() {
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/messages`, { cache: "no-store" });
      const payload = (await response.json()) as { messages?: CampaignMessage[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load draft messages");
      }
      const fetchedMessages = payload.messages ?? [];
      setDraftMessages(fetchedMessages);
      setEditableSubjectByLeadId(
        fetchedMessages.reduce<Record<string, string>>((acc, message) => {
          acc[message.lead_id] = message.subject ?? "";
          return acc;
        }, {})
      );
      setEditableBodyByLeadId(
        fetchedMessages.reduce<Record<string, string>>((acc, message) => {
          acc[message.lead_id] = message.body_text ?? "";
          return acc;
        }, {})
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load draft messages");
    }
  }

  useEffect(() => {
    void loadRecipients();
    void loadMessages();
  }, [campaignId]);

  async function loadLibrarySignals() {
    try {
      const query = new URLSearchParams({
        activeOnly: "1",
        includeDefaults: "1",
        template: "Lead Intel"
      });
      if (isGroupMode) {
        query.set("patternMode", "1");
      }
      const response = await fetch(`/api/signals?${query.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as { signals?: SignalRecord[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load Campaign Agents");
      }
      setLibrarySignals(dedupeLibrarySignalsById(payload.signals ?? []));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load Campaign Agents");
    }
  }

  const selectedLeadIds = useMemo(() => new Set(recipients.map((recipient) => recipient.lead_id)), [recipients]);

  const filteredLeads = useMemo(() => {
    return availableLeads.filter((lead) => {
      const search = audienceSearch.trim().toLowerCase();
      if (search) {
        const haystack = `${lead.full_name} ${lead.company} ${lead.role} ${lead.email ?? ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      if (priorityFilter === "hot" && !isHotLead(lead)) return false;
      if (priorityFilter === "high" && (lead.priority_score < 75 || lead.priority_score > 89)) return false;
      if (priorityFilter === "low" && lead.priority_score >= 75) return false;

      if (emailFilter === "has" && !lead.email) return false;
      if (emailFilter === "none" && lead.email) return false;

      return true;
    });
  }, [availableLeads, audienceSearch, priorityFilter, emailFilter]);

  const audienceSearchHasQuery = audienceSearch.trim().length > 0;
  /** Search-first picker: no rows until the user types in the search box (filters still apply to matches). */
  const leadsToShow = audienceSearchHasQuery ? filteredLeads : [];

  async function toggleRecipient(leadId: string, leadEmail: string | null) {
    setMessage(null);
    setError(null);
    setBusyLeadId(leadId);

    const alreadySelected = selectedLeadIds.has(leadId);
    if (!alreadySelected && !leadEmail) {
      setBusyLeadId(null);
      return;
    }

    try {
      const response = alreadySelected
        ? await fetch(
            `/api/campaigns/${encodeURIComponent(campaignId)}/recipients/${encodeURIComponent(leadId)}`,
            { method: "DELETE" }
          )
        : await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/recipients`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ leadIds: [leadId] })
          });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update recipients");
      }

      await loadRecipients();
      await loadMessages();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update recipients");
    } finally {
      setBusyLeadId(null);
    }
  }

  async function saveDraft(): Promise<boolean> {
    setMessage(null);
    setError(null);
    setSavingDraft(true);

    try {
      const messageDraftUpdates = isGroupMode
        ? (() => {
            const groupMessage = draftMessages[0];
            if (!groupMessage) {
              return [];
            }
            const nextSubject = patternDraftSubject.trim();
            const nextBody = patternDraftBodyText.trim();
            const originalSubject = groupMessage.subject?.trim() ?? "";
            const originalBody = groupMessage.body_text?.trim() ?? "";

            if (nextSubject === originalSubject && nextBody === originalBody) {
              return [];
            }

            return [
              {
                leadId: groupMessage.lead_id,
                subjectText: nextSubject || originalSubject,
                bodyText: nextBody || originalBody
              }
            ];
          })()
        : Array.from(selectedLeadIds)
            .map((leadId) => {
              const originalSubject = messageByLeadId[leadId]?.subject ?? "";
              const originalBody = messageByLeadId[leadId]?.body_text ?? "";
              const nextSubject = editableSubjectByLeadId[leadId];
              const nextBody = editableBodyByLeadId[leadId];
              const subjectChanged = nextSubject !== undefined && nextSubject !== originalSubject;
              const bodyChanged = nextBody !== undefined && nextBody !== originalBody;

              if (!subjectChanged && !bodyChanged) {
                return null;
              }

              return {
                leadId,
                subjectText: nextSubject ?? originalSubject,
                bodyText: nextBody ?? originalBody
              };
            })
            .filter((draft): draft is NonNullable<typeof draft> => Boolean(draft));

      if (messageDraftUpdates.length > 0) {
        const messagesResponse = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/messages`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ drafts: messageDraftUpdates })
        });
        const messagesPayload = (await messagesResponse.json()) as { error?: string };
        if (!messagesResponse.ok) {
          throw new Error(messagesPayload.error ?? "Failed to save per-lead message drafts");
        }
      }

      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: campaignName,
          ...(isGroupMode
            ? {
                draftSubject: patternDraftSubject,
                draftBodyText: patternDraftBodyText
              }
            : {})
        })
      });
      const payload = (await response.json()) as {
        error?: string;
        campaign?: {
          name?: string;
          draft_subject?: string | null;
          draft_body_text?: string | null;
        };
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save draft");
      }
      setCampaignName(payload.campaign?.name ?? campaignName);
      if (payload.campaign?.draft_subject !== undefined) {
        setPatternDraftSubject(payload.campaign.draft_subject?.trim() || "Following up from {{event}}");
      }
      if (payload.campaign?.draft_body_text !== undefined) {
        setPatternDraftBodyText(payload.campaign.draft_body_text?.trim() || "");
      }
      if (messageDraftUpdates.length > 0) {
        await loadMessages();
      }
      setMessage("Draft saved");
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save draft");
      return false;
    } finally {
      setSavingDraft(false);
    }
  }

  async function sendCampaign() {
    setMessage(null);
    setError(null);
    setSendingCampaign(true);
    try {
      if (campaignStatus === "draft") {
        const saved = await saveDraft();
        if (!saved) {
          return;
        }
      }

      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const payload = (await response.json()) as {
        error?: string;
        summary?: {
          campaignStatus: CampaignStatus;
          sent: number;
          failed: number;
          skippedNoEmail: number;
          attempted: number;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Send failed");
      }

      if (payload.summary) {
        setCampaignStatus(payload.summary.campaignStatus);
        const { sent, failed, skippedNoEmail, attempted } = payload.summary;
        setMessage(
          payload.summary.campaignStatus === "sent"
            ? `Campaign sent to ${sent} recipient${sent === 1 ? "" : "s"}.`
            : `Send finished: ${sent} sent, ${failed} failed, ${skippedNoEmail} skipped (no email), ${attempted} total.`
        );
      }

      await router.refresh();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Send failed");
    } finally {
      setSendingCampaign(false);
    }
  }

  async function persistBuilderConfig({
    selectedSignalIds: nextSignalIds,
    subjectLine: nextSubjectLine,
    draftSubject,
    draftBodyText
  }: {
    selectedSignalIds?: string[];
    subjectLine?: string;
    draftSubject?: string;
    draftBodyText?: string;
  }) {
    setSavingBuilderConfig(true);
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...(nextSignalIds !== undefined ? { selectedSignalIds: nextSignalIds } : {}),
          ...(nextSubjectLine !== undefined ? { subjectLine: nextSubjectLine } : {}),
          ...(draftSubject !== undefined ? { draftSubject } : {}),
          ...(draftBodyText !== undefined ? { draftBodyText } : {})
        })
      });

      const payload = (await response.json()) as {
        error?: string;
        campaign?: {
          selected_signals?: string[] | null;
          subject_line?: string | null;
          draft_subject?: string | null;
          draft_body_text?: string | null;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to persist campaign settings");
      }

      if (payload.campaign?.selected_signals !== undefined) {
        setSelectedSignalIds(normalizeSignalTokens(payload.campaign.selected_signals));
      }

      if (payload.campaign?.subject_line !== undefined) {
        setSubjectLine(payload.campaign.subject_line?.trim() || DEFAULT_SUBJECT_LINE);
      }

      if (payload.campaign?.draft_subject !== undefined) {
        setPatternDraftSubject(payload.campaign.draft_subject?.trim() || "Following up from {{event}}");
      }

      if (payload.campaign?.draft_body_text !== undefined) {
        setPatternDraftBodyText(payload.campaign.draft_body_text?.trim() || "");
      }
    } catch (persistError) {
      setError(persistError instanceof Error ? persistError.message : "Failed to persist campaign settings");
    } finally {
      setSavingBuilderConfig(false);
    }
  }

  async function generateDraft() {
    setMessage(null);
    setError(null);
    setGeneratingDraft(true);

    try {
      const requestedLeadIds = Array.from(selectedLeadIds);
      const subjectForRequest = isGroupMode ? patternDraftSubject : subjectLine;
      const selectedSignalRecords = selectedSignalIds
        .map((signalId) => librarySignals.find((signal) => signal.id === signalId))
        .filter((signal): signal is SignalRecord => Boolean(signal));
      const selectedSignalRecordIds = selectedSignalRecords.map((signal) => signal.id);
      if (
        process.env.NODE_ENV !== "production" &&
        selectedSignalRecordIds.length !== selectedSignalIds.length
      ) {
        throw new Error("Campaign Agent selection contains ids not present in fetched Campaign Agents data.");
      }
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/generate-draft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          generationMode: isGroupMode ? "group" : "single",
          subjectLine: subjectForRequest,
          selectedSignalIds: selectedSignalRecordIds,
          selectedLeadIds: requestedLeadIds,
          leadIds: requestedLeadIds,
          templateName: "Lead Intel",
          force: true
        })
      });
      const payload = (await response.json()) as GenerateDraftResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to generate draft");
      }

      console.log("CAMPAIGN_BUILDER_GENERATE_DRAFT_RESPONSE", {
        campaignId,
        payload
      });

      if (isGroupMode && payload.groupDraft) {
        setPatternDraftSubject(payload.groupDraft.subject?.trim() || "Following up from {{event}}");
        setPatternDraftBodyText(payload.groupDraft.body_text?.trim() || "");
      }
      if (payload.generationMode) {
        setGenerationMode(payload.generationMode);
      }

      if (payload.messages) {
        setDraftMessages(payload.messages);
        setEditableSubjectByLeadId(
          payload.messages.reduce<Record<string, string>>((acc, item) => {
            acc[item.lead_id] = item.subject ?? "";
            return acc;
          }, {})
        );
        setEditableBodyByLeadId(
          payload.messages.reduce<Record<string, string>>((acc, item) => {
            acc[item.lead_id] = item.body_text ?? "";
            return acc;
          }, {})
        );
      }
      if (payload.selectedSignalIds) {
        setSelectedSignalIds(normalizeSignalTokens(payload.selectedSignalIds));
      }
      const returnedLeadIds = new Set((payload.messages ?? []).map((messageItem) => messageItem.lead_id));
      let mismatchMessage: string | null = null;
      if (!isGroupMode && returnedLeadIds.size < requestedLeadIds.length) {
        mismatchMessage = `Generated ${returnedLeadIds.size} of ${requestedLeadIds.length} selected leads`;
        console.warn("CAMPAIGN_BUILDER_GENERATE_DRAFT_MISMATCH", {
          campaignId,
          requestedLeadIds,
          returnedLeadIds: [...returnedLeadIds],
          apiRequestedLeadCount: payload.requestedLeadCount,
          apiMissingLeadIds: payload.missingLeadIds
        });
      }
      setError(mismatchMessage);
      if ((payload.generatedCount ?? 0) === 0) {
        setMessage("No leads generated");
      } else {
        setMessage(
          `Draft generated for ${payload.generatedCount ?? 0} recipient${payload.generatedCount === 1 ? "" : "s"}`
        );
      }
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Failed to generate draft");
    } finally {
      setGeneratingDraft(false);
    }
  }

  function toggleSignal(signalId: string) {
    const signal = librarySignalById.get(signalId);
    if (signal && isAiSummarySignalName(signal.name) && !aiSummaryForSelection) {
      return;
    }

    setSelectedSignalIds((current) => {
      const nextSignalIds = current.includes(signalId)
        ? current.filter((item) => item !== signalId)
        : [...current, signalId];
      const normalized = normalizeSignalTokens(nextSignalIds);
      void persistBuilderConfig({ selectedSignalIds: normalized });
      return normalized;
    });
  }

  const canEditDraft = campaignStatus === "draft";
  const selectedCount = recipients.length;
  const hasMultipleLeads = selectedCount > 1;
  const isGroupMode = generationMode === "group" && hasMultipleLeads;

  useEffect(() => {
    setCampaignStatus(status);
  }, [status]);

  const audienceSectionOpen = selectedCount === 0 || audienceExpanded;
  const patternModeActive = isGroupMode;
  const messageByLeadId = useMemo(() => toMessageMap(draftMessages), [draftMessages]);
  const librarySignalById = useMemo(() => new Map(librarySignals.map((signal) => [signal.id, signal])), [librarySignals]);
  const renderableSignalIds = useMemo(() => getRenderableSignalIds(librarySignals), [librarySignals]);

  useEffect(() => {
    const previousSelectedCount = previousSelectedCountRef.current;
    if (selectedCount <= 1) {
      if (generationMode !== "single") {
        setGenerationMode("single");
      }
      previousSelectedCountRef.current = selectedCount;
      return;
    }

    if (previousSelectedCount <= 1 && selectedCount > 1) {
      setGenerationMode("group");
    }
    previousSelectedCountRef.current = selectedCount;
  }, [selectedCount, generationMode]);

  useEffect(() => {
    void loadLibrarySignals();
  }, [campaignId, isGroupMode]);

  useEffect(() => {
    if (librarySignals.length === 0) {
      return;
    }

    setSelectedSignalIds((current) => {
      const normalized = resolveSelectedSignalIdsFromTokens({
        selectedTokens: current,
        librarySignals
      });

      if (arraysEqual(current, normalized)) {
        return current;
      }

      void persistBuilderConfig({ selectedSignalIds: normalized });
      return normalized;
    });
  }, [librarySignals]);

  useEffect(() => {
    if (!hasMountedTemplateSubjectRef.current) {
      hasMountedTemplateSubjectRef.current = true;
      return;
    }

    if (isGroupMode) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void persistBuilderConfig({ subjectLine });
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [subjectLine, campaignId, isGroupMode]);

  useEffect(() => {
    if (!hasMountedPatternDraftRef.current) {
      hasMountedPatternDraftRef.current = true;
      return;
    }

    if (!isGroupMode) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void persistBuilderConfig({
        draftSubject: patternDraftSubject,
        draftBodyText: patternDraftBodyText
      });
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [campaignId, isGroupMode, patternDraftSubject, patternDraftBodyText]);

  useEffect(() => {
    if (recipients.length === 0) {
      setActiveLeadId(null);
      return;
    }

    if (!activeLeadId || !selectedLeadIds.has(activeLeadId)) {
      setActiveLeadId(recipients[0].lead_id);
    }
  }, [activeLeadId, recipients, selectedLeadIds]);

  const effectiveActiveLeadId =
    activeLeadId && selectedLeadIds.has(activeLeadId) ? activeLeadId : recipients[0]?.lead_id ?? null;
  const activeMessage = !isGroupMode && effectiveActiveLeadId ? messageByLeadId[effectiveActiveLeadId] ?? null : null;
  const groupMessage = isGroupMode ? draftMessages[0] ?? null : null;
  const previewMessage = isGroupMode ? groupMessage : activeMessage;
  const activeRecipient = effectiveActiveLeadId
    ? recipients.find((recipient) => recipient.lead_id === effectiveActiveLeadId) ?? null
    : null;
  const selectedEventNames = [
    ...new Set(
      recipients
        .map((recipient) => recipient.event_name?.trim() ?? "")
        .filter((eventName): eventName is string => Boolean(eventName))
    )
  ];
  const previewEventName =
    selectedCount === 1
      ? (activeRecipient?.event_name?.trim() ?? selectedEventNames[0] ?? "our event")
      : selectedEventNames.length === 1
        ? selectedEventNames[0]
        : "our recent event";
  const activeLeadFullName = activeRecipient?.name ?? activeMessage?.full_name ?? "";
  const activeBodyText = isGroupMode
    ? patternDraftBodyText || groupMessage?.body_text || ""
    : effectiveActiveLeadId
      ? (editableBodyByLeadId[effectiveActiveLeadId] ?? activeMessage?.body_text ?? "")
      : "";
  const activeSubjectText = isGroupMode
    ? patternDraftSubject || groupMessage?.subject || ""
    : effectiveActiveLeadId
      ? (editableSubjectByLeadId[effectiveActiveLeadId] ?? activeMessage?.subject ?? "")
      : "";
  const hasPreviewDraft = Boolean(previewMessage?.id || (isGroupMode && patternDraftBodyText.trim()));
  const previewLeadName = isGroupMode ? null : activeRecipient?.name ?? activeMessage?.full_name ?? null;
  const resolvedPreviewSubject =
    activeSubjectText.trim() ||
    resolveSubjectTemplate({
      subjectLineTemplate: isGroupMode ? patternDraftSubject : subjectLine,
      fullName: activeLeadFullName,
      eventName: previewEventName,
      omitPersonalName: isGroupMode
    });

  const selectedSignalRecords = useMemo(() => {
    return selectedSignalIds
      .map((signalId) => librarySignalById.get(signalId))
      .filter((signal): signal is SignalRecord => Boolean(signal));
  }, [librarySignalById, selectedSignalIds]);

  const selectedConversationSummaries = useMemo(
    () =>
      recipients
        .map((recipient) => normalizeConversationSummary(recipient.latest_ai_summary))
        .filter((summary): summary is string => Boolean(summary)),
    [recipients]
  );

  const aiSummaryForSelection = useMemo(() => {
    if (selectedConversationSummaries.length === 0) {
      return null;
    }
    if (selectedConversationSummaries.length === 1) {
      return selectedConversationSummaries[0];
    }
    return combineConversationSummaries(selectedConversationSummaries);
  }, [selectedConversationSummaries]);

  const aiSummarySignalId = useMemo(() => {
    const aiSummarySignal = librarySignals.find((signal) => isAiSummarySignalName(signal.name));
    return aiSummarySignal?.id ?? null;
  }, [librarySignals]);

  useEffect(() => {
    if (!aiSummarySignalId || aiSummaryForSelection) {
      return;
    }

    if (!selectedSignalIds.includes(aiSummarySignalId)) {
      return;
    }

    setSelectedSignalIds((current) => {
      if (!current.includes(aiSummarySignalId)) {
        return current;
      }

      const normalized = normalizeSignalTokens(current.filter((item) => item !== aiSummarySignalId));
      void persistBuilderConfig({ selectedSignalIds: normalized });
      return normalized;
    });
  }, [aiSummaryForSelection, aiSummarySignalId, selectedSignalIds]);

  const rawSignalContentById = useMemo(() => {
    return selectedSignalRecords.reduce<Record<string, string>>((acc, signal) => {
      if (isAiSummarySignalName(signal.name)) {
        acc[signal.id] = aiSummaryForSelection ?? "No conversation summary available";
        return acc;
      }
      acc[signal.id] =
        signal.effective_prompt?.trim() ||
        signal.default_prompt?.trim() ||
        "No prompt configured for this Campaign Agent.";
      return acc;
    }, {});
  }, [aiSummaryForSelection, selectedSignalRecords]);

  const selectedSignalGroups = useMemo(() => {
    const groups: Record<"AI-Powered" | "Contextual" | "Custom" | "Call-to-Action", SignalRecord[]> = {
      "AI-Powered": [],
      Contextual: [],
      Custom: [],
      "Call-to-Action": []
    };
    for (const signal of selectedSignalRecords) {
      groups[signal.category]?.push(signal);
    }
    return groups;
  }, [selectedSignalRecords]);

  const activeLeadContext = useMemo(() => {
    if (isGroupMode || !effectiveActiveLeadId) {
      return null;
    }
    return availableLeads.find((lead) => lead.id === effectiveActiveLeadId) ?? null;
  }, [availableLeads, effectiveActiveLeadId, isGroupMode]);

  const selectedAudienceLeads = useMemo(() => {
    const selectedIds = new Set(recipients.map((recipient) => recipient.lead_id));
    return availableLeads.filter((lead) => selectedIds.has(lead.id));
  }, [availableLeads, recipients]);

  const orderedSelectedAudience = useMemo(
    () =>
      orderedSelectedAudienceEntries(
        recipients.map((r) => ({
          lead_id: r.lead_id,
          name: r.name,
          company: r.company,
          role: r.role
        })),
        availableLeads
      ),
    [recipients, availableLeads]
  );

  const COLLAPSED_NAME_PREVIEW = 2;
  const audienceCollapsedDisplayNames = useMemo(
    () => orderedSelectedAudience.map((e) => (e.kind === "lead" ? e.lead.full_name : e.name)),
    [orderedSelectedAudience]
  );

  const groupInfluenceSummary = useMemo(() => {
    if (!isGroupMode) {
      return null;
    }
    const companies = new Set(selectedAudienceLeads.map((lead) => lead.company?.trim()).filter(Boolean));
    const industries = new Set(selectedAudienceLeads.map((lead) => lead.industry?.trim()).filter(Boolean));
    const roles = new Set(selectedAudienceLeads.map((lead) => lead.role?.trim()).filter(Boolean));

    return {
      leads: selectedAudienceLeads.length,
      companies: companies.size,
      industries: industries.size,
      titles: roles.size
    };
  }, [isGroupMode, selectedAudienceLeads]);

  const activeLeadHasDraft = Boolean(previewMessage?.id);
  const activeLeadDirty =
    isGroupMode
      ? (patternDraftSubject.trim() || "") !== (groupMessage?.subject?.trim() || "") ||
        (patternDraftBodyText.trim() || "") !== (groupMessage?.body_text?.trim() || "")
      : Boolean(effectiveActiveLeadId) &&
        ((editableSubjectByLeadId[effectiveActiveLeadId ?? ""] ?? (activeMessage?.subject ?? "")) !==
          (activeMessage?.subject ?? "") ||
          (editableBodyByLeadId[effectiveActiveLeadId ?? ""] ?? (activeMessage?.body_text ?? "")) !==
            (activeMessage?.body_text ?? ""));

  const ctaSummary = selectedSignalGroups["Call-to-Action"][0]?.effective_prompt?.trim() ?? null;

  const canSendCampaign = useMemo(() => {
    if (selectedCount === 0) {
      return false;
    }
    if (campaignStatus === "sent" || campaignStatus === "sending") {
      return false;
    }
    if (isGroupMode) {
      const gm = draftMessages[0];
      const subj = patternDraftSubject.trim() || gm?.subject?.trim() || "";
      const body = patternDraftBodyText.trim() || gm?.body_text?.trim() || "";
      return Boolean(
        subj.trim() &&
          body.trim() &&
          selectedAudienceLeads.length > 0 &&
          selectedAudienceLeads.every((lead) => lead.email)
      );
    }
    return selectedAudienceLeads.every((lead) => {
      if (!lead.email) {
        return false;
      }
      const subj = editableSubjectByLeadId[lead.id] ?? messageByLeadId[lead.id]?.subject ?? "";
      const body = editableBodyByLeadId[lead.id] ?? messageByLeadId[lead.id]?.body_text ?? "";
      return Boolean(subj.trim() && body.trim());
    });
  }, [
    selectedCount,
    campaignStatus,
    isGroupMode,
    draftMessages,
    selectedAudienceLeads,
    patternDraftSubject,
    patternDraftBodyText,
    editableSubjectByLeadId,
    editableBodyByLeadId,
    messageByLeadId
  ]);

  return (
    <section className="space-y-4 pb-28 max-w-[1400px] mx-auto">
      <Link href="/exhibitor/campaigns" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        <span>Campaigns</span>
      </Link>

      <header className="space-y-0.5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Campaign Builder</h1>
        <p className="text-sm font-medium text-slate-500">AI-powered follow-up campaigns with personalized outreach</p>
      </header>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

      <div className="space-y-4">
        <div className="overflow-hidden rounded-2xl border bg-white">
          {selectedCount === 0 ? (
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="campaign-audience-heading" className="text-base font-bold text-slate-900">
                  Audience
                </h2>
                <span className="rounded-lg bg-indigo-600 px-2.5 py-0.5 text-xs font-bold text-white">{selectedCount}</span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              id="campaign-audience-disclosure"
              className="group flex w-full cursor-pointer items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
              onClick={() => setAudienceExpanded((open) => !open)}
              aria-expanded={audienceSectionOpen}
              aria-controls="campaign-audience-panel"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="campaign-audience-heading" className="text-base font-bold text-slate-900">
                    Audience
                  </h2>
                  <span className="rounded-lg bg-indigo-600 px-2.5 py-0.5 text-xs font-bold text-white">{selectedCount}</span>
                </div>
                {!audienceSectionOpen ? (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-sm font-medium leading-snug text-slate-700">
                      {audienceCollapsedDisplayNames.slice(0, COLLAPSED_NAME_PREVIEW).join(" · ")}
                      {audienceCollapsedDisplayNames.length > COLLAPSED_NAME_PREVIEW ? (
                        <span className="font-normal text-slate-500">
                          {" "}
                          · +{audienceCollapsedDisplayNames.length - COLLAPSED_NAME_PREVIEW} more
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">Click to review selected leads, search, and filters.</p>
                    {!isGroupMode && hasMultipleLeads && previewLeadName ? (
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Previewing: <span className="font-semibold normal-case text-slate-700">{previewLeadName}</span>
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <span
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 transition group-hover:bg-indigo-100"
                aria-hidden
              >
                <svg
                  className={`h-6 w-6 transition-transform duration-200 ${audienceSectionOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.25}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </button>
          )}

          {audienceSectionOpen ? (
            <div id="campaign-audience-panel" role="region" aria-labelledby="campaign-audience-heading">
              <div className="space-y-3 border-t px-4 pb-4 pt-3">
                <input
                  value={audienceSearch}
                  onChange={(event) => setAudienceSearch(event.target.value)}
                  placeholder="Type to search leads…"
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                />
                <select
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value as "all" | "hot" | "high" | "low")}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                >
                  <option value="all">All Priorities</option>
                  <option value="hot">Hot</option>
                  <option value="high">High (75-89)</option>
                  <option value="low">Low (&lt;75)</option>
                </select>
                <select
                  value={emailFilter}
                  onChange={(event) => setEmailFilter(event.target.value as "all" | "has" | "none")}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                >
                  <option value="all">Email Status</option>
                  <option value="has">Has Email</option>
                  <option value="none">No Email</option>
                </select>
                <p className="text-xs text-slate-500">
                  Search and filters below apply to your full lead catalog. Selected recipients stay listed above the
                  search results.
                </p>
              </div>

              {selectedCount > 0 ? (
                <div
                  className="border-t border-slate-200 bg-slate-50/80 px-4 py-3"
                  data-testid="audience-selected-leads"
                >
                  <div className="mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Selected leads</h3>
                  </div>
                  <ul className="max-h-[min(240px,38vh)] space-y-2 overflow-y-auto pr-0.5">
                    {orderedSelectedAudience.map((entry) => {
                      const busy = busyLeadId === entry.leadId;
                      const title =
                        entry.kind === "lead"
                          ? [entry.lead.role, entry.lead.company].filter(Boolean).join(" · ")
                          : [entry.role, entry.company].filter(Boolean).join(" · ");
                      const displayName = entry.kind === "lead" ? entry.lead.full_name : entry.name;
                      const email = entry.kind === "lead" ? entry.lead.email : null;
                      return (
                        <li
                          key={entry.leadId}
                          data-testid="audience-selected-lead-row"
                          data-lead-id={entry.leadId}
                          className="flex items-start gap-2 rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 shadow-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                            {title ? <p className="truncate text-xs text-slate-600">{title}</p> : null}
                            <p className="truncate text-xs text-slate-500">
                              {email ? email : <span className="text-amber-700">No email on file</span>}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={busy || !canEditDraft}
                            onClick={() =>
                              void toggleRecipient(entry.leadId, entry.kind === "lead" ? entry.lead.email : null)
                            }
                            className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-800 disabled:opacity-50"
                            aria-label={`Remove ${displayName} from campaign`}
                          >
                            {busy ? "…" : "Remove"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              <div className="max-h-[min(680px,55vh)] divide-y overflow-y-auto border-t">
                {leadsToShow.map((lead) => {
                  const selected = selectedLeadIds.has(lead.id);
                  const noEmail = !lead.email;
                  const disabled = busyLeadId === lead.id || (noEmail && !selected);
                  const isActive = !isGroupMode && effectiveActiveLeadId === lead.id;
                  return (
                    <div
                      key={lead.id}
                      onClick={() => {
                        if (!isGroupMode) {
                          setActiveLeadId(lead.id);
                        }
                      }}
                      className={`flex gap-3 px-4 py-3 ${
                        disabled
                          ? "cursor-not-allowed opacity-70"
                          : isGroupMode
                            ? "cursor-default"
                            : "cursor-pointer hover:bg-slate-50"
                      } ${isActive ? "border-l-2 border-l-accent bg-violet-50/60" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={disabled}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => void toggleRecipient(lead.id, lead.email)}
                        className="mt-1 h-4 w-4"
                      />
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-slate-900">{lead.full_name}</p>
                          <span className={`font-semibold ${priorityTag(lead.priority_score)}`}>{lead.priority_score}</span>
                        </div>
                        <p className="truncate text-slate-600">{lead.company}</p>
                        <p className="truncate text-slate-500">{lead.role || "No role"}</p>
                        {lead.email ? (
                          <p className="truncate text-slate-500">{lead.email}</p>
                        ) : (
                          <p className="text-amber-600">No email</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {audienceSearchHasQuery && leadsToShow.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-500">No leads match your search or filters.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <main className="space-y-4">
          <section className="rounded-2xl border bg-white p-5">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Campaign Name</label>
            <input
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
              disabled={!canEditDraft}
              className="w-full rounded-xl border px-4 py-3 text-lg disabled:bg-slate-100"
              placeholder="e.g., Tech Summit Follow-up - Hot Leads"
            />
          </section>

          <section className="overflow-hidden rounded-2xl border bg-white">
            <h3 className="border-b px-5 py-3 text-base font-bold text-slate-900">Template</h3>
            <div className="space-y-4 p-5">
              <div className="rounded-xl border-t-4 border-t-accent border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">SignalThread LR</p>
                <p className="text-sm text-slate-600">Professional Outreach</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Subject Line</label>
                <input
                  value={isGroupMode ? patternDraftSubject : subjectLine}
                  onChange={(event) => {
                    if (isGroupMode) {
                      setPatternDraftSubject(event.target.value);
                    } else {
                      setSubjectLine(event.target.value);
                    }
                  }}
                  className="w-full rounded-xl border px-4 py-3 text-sm"
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700">Select Campaign Agents to Include</p>
                <div className="flex flex-wrap gap-2">
                  {renderableSignalIds.map((signalId) => {
                    const signal = librarySignalById.get(signalId);
                    if (!signal) {
                      if (process.env.NODE_ENV !== "production") {
                        throw new Error(`Campaign Agent chip ${signalId} is not present in fetched Campaign Agents data.`);
                      }
                      return null;
                    }
                    const active = selectedSignalIds.includes(signal.id);
                    const aiSummaryDisabled = isAiSummarySignalName(signal.name) && !aiSummaryForSelection;
                    const chipStyle = CATEGORY_CAMPAIGN_CHIP[signal.category];
                    return (
                      <button
                        type="button"
                        key={signal.id}
                        onClick={() => toggleSignal(signal.id)}
                        disabled={aiSummaryDisabled}
                        title={aiSummaryDisabled ? "No conversation summary available" : undefined}
                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                          aiSummaryDisabled
                            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                            : active
                              ? chipStyle.active
                              : chipStyle.inactive
                        }`}
                      >
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
                          <SignalCategoryGlyph category={signal.category} />
                        </span>
                        {signal.name}
                      </button>
                    );
                  })}
                </div>
                {aiSummarySignalId && !aiSummaryForSelection ? (
                  <p className="mt-2 text-xs text-slate-500">Conversation Brief Agent: No conversation summary available.</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSignalsModalOpen(true)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  <span aria-hidden="true">+</span>
                  <span>Add More Campaign Agents</span>
                </button>
              </div>

              {hasMultipleLeads ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Generation Mode</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setGenerationMode("group")}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                        isGroupMode
                          ? "border-violet-300 bg-violet-50 text-accent"
                          : "border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-accent"
                      }`}
                    >
                      Group Broadcast
                    </button>
                    <button
                      type="button"
                      onClick={() => setGenerationMode("single")}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                        !isGroupMode
                          ? "border-violet-300 bg-violet-50 text-accent"
                          : "border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-accent"
                      }`}
                    >
                      Single Lead Precision
                    </button>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                disabled={!canEditDraft || selectedCount === 0 || selectedSignalIds.length === 0 || generatingDraft}
                onClick={() => void generateDraft()}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-3 font-semibold text-white disabled:opacity-60"
              >
                {generatingDraft ? "Generating..." : "Generate Campaign Draft"}
              </button>
              {selectedSignalIds.length === 0 ? (
                <p className="mt-2 text-xs text-amber-600">Select at least one Campaign Agent to generate a campaign draft.</p>
              ) : null}

              {savingBuilderConfig ? <p className="text-xs text-slate-500">Saving template settings…</p> : null}

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Email Body</label>
                <div className="min-h-[360px] rounded-xl border bg-slate-50 p-4">
                  {selectedSignalRecords.length > 0 ? (
                    <div className="space-y-4">
                      {selectedSignalRecords.map((signal) => (
                        <EmailSignalBlock
                          key={signal.id}
                          name={signal.name}
                          category={signal.category}
                          content={rawSignalContentById[signal.id] ?? "No prompt configured for this Campaign Agent."}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="pt-6 text-center text-sm text-slate-500">
                      Select Campaign Agents to begin building your draft.
                    </p>
                  )}

                  <p className="mt-4 border-t border-slate-200 pt-4 text-xs text-slate-500">
                    Campaign Agent guidance only. Final drafted email is shown in Campaign Draft Preview after Generate.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </main>

        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-white">
          <div className="border-b px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">
              {isGroupMode ? `Group Draft · ${selectedCount} leads` : `Draft Preview · ${selectedCount} leads`}
            </h2>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
            {!isGroupMode && previewLeadName ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Previewing: <span className="text-slate-700">{previewLeadName}</span> (click a lead in the Audience section to switch)
              </p>
            ) : null}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subject</p>
              <input
                value={hasPreviewDraft ? activeSubjectText : ""}
                onChange={(event) => {
                  if (isGroupMode) {
                    setPatternDraftSubject(event.target.value);
                    return;
                  }
                  if (!effectiveActiveLeadId) return;
                  setEditableSubjectByLeadId((current) => ({
                    ...current,
                    [effectiveActiveLeadId]: event.target.value
                  }));
                }}
                disabled={!canEditDraft || selectedCount === 0 || (!isGroupMode && !effectiveActiveLeadId)}
                placeholder={
                  selectedCount > 0
                    ? hasPreviewDraft
                      ? resolvedPreviewSubject
                      : isGroupMode
                        ? "Generate a group draft to preview."
                        : "Generate a draft to preview."
                    : "Generate a draft to preview."
                }
                className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:bg-slate-100"
              />
              {activeLeadDirty ? <p className="mt-2 text-xs font-semibold text-amber-600">Edited</p> : null}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-slate-50 p-3">
              <textarea
                value={hasPreviewDraft ? activeBodyText : ""}
                onChange={(event) => {
                  if (isGroupMode) {
                    setPatternDraftBodyText(event.target.value);
                    return;
                  }
                  if (!effectiveActiveLeadId) return;
                  setEditableBodyByLeadId((current) => ({
                    ...current,
                    [effectiveActiveLeadId]: event.target.value
                  }));
                }}
                disabled={!canEditDraft || selectedCount === 0 || (!isGroupMode && !effectiveActiveLeadId)}
                placeholder={isGroupMode ? "Generate a group draft to preview." : "Generate a draft to preview."}
                className="h-full max-h-[45vh] min-h-[260px] w-full resize-none whitespace-pre-wrap rounded-lg border bg-white p-3 text-sm leading-relaxed text-slate-700 disabled:bg-slate-100 xl:max-h-[60vh]"
              />
            </div>
          </div>
          <div className="border-t bg-slate-50 px-5 py-4">
            <div className="mb-2 flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-700">Draft Influences</p>
              {patternModeActive ? (
                <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-accent">Pattern Mode Active</span>
              ) : !isGroupMode ? (
                <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-accent">Single Lead Precision</span>
              ) : null}
            </div>
            <div className="space-y-3 text-sm text-slate-700">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">What we used to generate this draft</p>
                {isGroupMode ? (
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      Leads selected: {groupInfluenceSummary?.leads ?? selectedCount}
                    </span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      Companies: {groupInfluenceSummary?.companies ?? 0}
                    </span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      Industries: {groupInfluenceSummary?.industries ?? 0}
                    </span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      Titles: {groupInfluenceSummary?.titles ?? 0}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      Title: {activeLeadContext?.role?.trim() || "unknown"}
                    </span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      Company: {activeLeadContext?.company?.trim() || "unknown"}
                    </span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      Size: {activeLeadContext?.company_size?.trim() || "unknown"}
                    </span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      Industry: {activeLeadContext?.industry?.trim() || "unknown"}
                    </span>
                  </div>
                )}
              </div>

              {(
                ["AI-Powered", "Contextual", "Custom", "Call-to-Action"] as const
              ).map((category) => {
                const items = selectedSignalGroups[category];
                if (items.length === 0) return null;
                const visual = CATEGORY_VISUALS[category];
                return (
                  <div key={category}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{category}</p>
                    <div className="flex flex-wrap gap-2">
                      {items.map((signal) => (
                        <span
                          key={signal.id}
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${visual.badgeWrap}`}
                        >
                          {signal.name}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}

              {ctaSummary ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">CTA Summary</p>
                  <p className="mt-1 text-sm text-emerald-800">{ctaSummary}</p>
                </div>
              ) : null}

              {selectedCount > 0 && !activeLeadHasDraft ? (
                <p className="text-xs text-slate-500">
                  {isGroupMode
                    ? "Generate draft to populate the shared group subject and body."
                    : "Generate draft to populate per-lead editable subject and body."}
                </p>
              ) : null}
            </div>
          </div>
        </aside>
        </div>
      </div>

      <div className="fixed inset-x-4 bottom-4 z-30 rounded-2xl border bg-white/95 p-4 shadow-lg backdrop-blur md:inset-x-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-800">{selectedCount} leads selected</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={!canEditDraft || savingDraft}
              className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
            >
              {savingDraft ? "Saving..." : "Save Draft"}
            </button>
            <button type="button" disabled className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-white opacity-60">
              Mark Ready
            </button>
            <button
              type="button"
              disabled={!canSendCampaign || sendingCampaign || savingDraft}
              onClick={() => void sendCampaign()}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {sendingCampaign ? "Sending…" : `Send Campaign (${selectedCount})`}
            </button>
          </div>
        </div>
      </div>

      {loadingRecipients ? <p className="text-sm text-slate-500">Loading recipients...</p> : null}

      <SignalLibraryModal
        open={signalsModalOpen}
        signals={librarySignals}
        initialSelectedSignalNames={selectedSignalRecords.map((signal) => signal.name)}
        onClose={() => setSignalsModalOpen(false)}
        onSelectSignals={(signalNames) => {
          const signalIds = normalizeSignalTokens(
            signalNames
              .map((signalName) => librarySignals.find((signal) => signal.name === signalName)?.id ?? "")
              .filter(Boolean)
          );
          setSelectedSignalIds(signalIds);
          void persistBuilderConfig({ selectedSignalIds: signalIds });
          setSignalsModalOpen(false);
        }}
      />
    </section>
  );
}
