"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, CheckCircle2, Loader2, MessageSquare, Send, ShieldAlert, Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { FEATURES } from "@/config/features";
import type { CopilotActionType, CopilotChatResponse, CopilotExecuteResponse, CopilotMode, ProposedAction } from "@/lib/copilot/types";

type ProposalState = "pending" | "executed" | "rejected" | "failed";

type ChatMessage =
  | {
      id: string;
      role: "user";
      text: string;
      createdAt: number;
    }
  | {
      id: string;
      role: "assistant";
      text: string;
      createdAt: number;
    }
  | {
      id: string;
      role: "proposal";
      createdAt: number;
      auditLogId: string;
      canExecute: boolean;
      action: ProposedAction;
      state: ProposalState;
      resultSummary?: string;
      serverMessage?: string;
    };

function makeId(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}

function formatActionType(actionType: CopilotActionType): string {
  return actionType
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatParamValue(value: unknown): string {
  if (value === null || typeof value === "undefined") return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return "[object]";
  return String(value);
}

function inferEventContext(pathname: string): { eventId?: string; module?: string; surface?: string } {
  const match = pathname.match(/^\/events\/([^/]+)(?:\/(.*))?$/);
  if (!match) {
    const globalSurface = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
    return { module: globalSurface, surface: globalSurface };
  }

  const eventId = match[1]?.trim();
  const moduleSegment = match[2]?.split("/")[0]?.trim();

  return {
    ...(eventId ? { eventId } : {}),
    module: moduleSegment || "overview",
    surface: moduleSegment || "event",
  };
}

export function PlannerCopilot() {
  const pathname = usePathname();
  const context = useMemo(() => inferEventContext(pathname), [pathname]);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CopilotMode>("ask");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: makeId("assistant"),
      role: "assistant",
      text: "Planner Copilot is ready. Use Ask for read-only insights or Do for propose-and-approve actions.",
      createdAt: Date.now(),
    },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const feedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const node = feedRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [open, messages, isSubmitting]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function sendPrompt() {
    const prompt = draft.trim();
    if (!prompt || isSubmitting) return;

    const userMessage: ChatMessage = {
      id: makeId("user"),
      role: "user",
      text: prompt,
      createdAt: Date.now(),
    };

    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          prompt,
          context: {
            ...context,
            pagePath: pathname,
          },
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as CopilotChatResponse | { error?: string };

      if (!response.ok) {
        const errorMessage = typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Copilot request failed";

        setMessages((current) => [
          ...current,
          {
            id: makeId("assistant"),
            role: "assistant",
            text: errorMessage,
            createdAt: Date.now(),
          },
        ]);
        return;
      }

      if ((payload as CopilotChatResponse).kind === "answer") {
        const answer = payload as Extract<CopilotChatResponse, { kind: "answer" }>;
        setMessages((current) => [
          ...current,
          {
            id: makeId("assistant"),
            role: "assistant",
            text: answer.message,
            createdAt: Date.now(),
          },
        ]);
        return;
      }

      if ((payload as CopilotChatResponse).kind === "clarification") {
        const clarification = payload as Extract<CopilotChatResponse, { kind: "clarification" }>;
        setMessages((current) => [
          ...current,
          {
            id: makeId("assistant"),
            role: "assistant",
            text: clarification.message,
            createdAt: Date.now(),
          },
        ]);
        return;
      }

      const proposal = payload as Extract<CopilotChatResponse, { kind: "proposal" }>;
      setMessages((current) => [
        ...current,
        {
          id: makeId("proposal"),
          role: "proposal",
          createdAt: Date.now(),
          auditLogId: proposal.auditLogId,
          canExecute: proposal.canExecute,
          action: proposal.proposedAction,
          state: "pending",
          ...(proposal.message ? { serverMessage: proposal.message } : {}),
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: makeId("assistant"),
          role: "assistant",
          text: error instanceof Error ? error.message : "Copilot request failed",
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function decideProposal(messageId: string, approved: boolean) {
    const message = messages.find((entry) => entry.id === messageId && entry.role === "proposal");
    if (!message || message.role !== "proposal" || message.state !== "pending") return;

    setMessages((current) =>
      current.map((entry) => {
        if (entry.id !== messageId || entry.role !== "proposal") return entry;
        return {
          ...entry,
          state: approved ? "pending" : "rejected",
          ...(approved ? {} : { resultSummary: "Rejected by user." }),
        };
      }),
    );

    try {
      const response = await fetch("/api/copilot/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auditLogId: message.auditLogId,
          approved,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as CopilotExecuteResponse | { error?: string };

      if (!response.ok) {
        const errorMessage = typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Action execution failed";

        setMessages((current) =>
          current.map((entry) => {
            if (entry.id !== messageId || entry.role !== "proposal") return entry;
            return {
              ...entry,
              state: "failed",
              resultSummary: errorMessage,
            };
          }),
        );

        setMessages((current) => [
          ...current,
          {
            id: makeId("assistant"),
            role: "assistant",
            text: errorMessage,
            createdAt: Date.now(),
          },
        ]);

        return;
      }

      const result = payload as CopilotExecuteResponse;

      setMessages((current) =>
        current.map((entry) => {
          if (entry.id !== messageId || entry.role !== "proposal") return entry;
          return {
            ...entry,
            state: result.status === "executed" ? "executed" : result.status === "rejected" ? "rejected" : "failed",
            resultSummary: result.resultSummary ?? result.message,
          };
        }),
      );

      setMessages((current) => [
        ...current,
        {
          id: makeId("assistant"),
          role: "assistant",
          text: result.resultSummary ?? result.message,
          createdAt: Date.now(),
        },
      ]);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Action execution failed";
      setMessages((current) =>
        current.map((entry) => {
          if (entry.id !== messageId || entry.role !== "proposal") return entry;
          return {
            ...entry,
            state: "failed",
            resultSummary: messageText,
          };
        }),
      );
    }
  }

  if (!FEATURES.COPILOT_ENABLED) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="fixed right-6 bottom-6 z-40 inline-flex items-center gap-2 rounded-full border border-[#28439A] bg-[#28439A] px-4 py-2 text-[13px] font-semibold text-white shadow-lg transition hover:bg-[#1f347d]"
      >
        <Sparkles className="h-4 w-4" />
        Planner Copilot
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
          <section className="flex h-full w-full max-w-[440px] flex-col border-l border-slate-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-[16px] font-semibold text-slate-900">Planner Copilot</h3>
                <p className="text-[12px] text-slate-500">Context: {context.eventId ? `Event ${context.eventId}` : "Global"} · {context.module ?? "module"}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close copilot"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="border-b border-slate-200 px-4 py-3">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setMode("ask")}
                  className={[
                    "rounded-md px-3 py-1.5 text-[12px] font-semibold transition",
                    mode === "ask" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
                  ].join(" ")}
                >
                  Ask
                </button>
                <button
                  type="button"
                  onClick={() => setMode("do")}
                  className={[
                    "rounded-md px-3 py-1.5 text-[12px] font-semibold transition",
                    mode === "do" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
                  ].join(" ")}
                >
                  Do
                </button>
              </div>
            </div>

            <div ref={feedRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((message) => {
                if (message.role === "user") {
                  return (
                    <article key={message.id} className="ml-10 rounded-2xl bg-[#28439A] px-3 py-2 text-[13px] text-white">
                      {message.text}
                    </article>
                  );
                }

                if (message.role === "assistant") {
                  return (
                    <article key={message.id} className="mr-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800">
                      {message.text}
                    </article>
                  );
                }

                const paramEntries = Object.entries(message.action.params).filter(([, value]) => value !== null && typeof value !== "undefined" && !(typeof value === "string" && value.trim() === ""));

                return (
                  <article key={message.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Proposed Action</p>
                        <h4 className="mt-0.5 text-[14px] font-semibold text-slate-900">{formatActionType(message.action.actionType)}</h4>
                        <p className="mt-1 text-[13px] text-slate-700">{message.action.summary}</p>
                      </div>
                      <span className={[
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        message.action.riskLevel === "high"
                          ? "bg-red-100 text-red-700"
                          : message.action.riskLevel === "medium"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700",
                      ].join(" ")}>
                        {message.action.riskLevel}
                      </span>
                    </div>

                    {message.action.target ? (
                      <p className="mt-2 text-[12px] text-slate-600">
                        Target: {message.action.target.entityType}
                        {message.action.target.displayName ? ` · ${message.action.target.displayName}` : ""}
                      </p>
                    ) : null}

                    {paramEntries.length > 0 ? (
                      <dl className="mt-3 grid grid-cols-1 gap-1 rounded-lg border border-slate-100 bg-slate-50 p-2">
                        {paramEntries.slice(0, 8).map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between gap-2 text-[12px]">
                            <dt className="font-medium text-slate-600">{key}</dt>
                            <dd className="truncate text-slate-900">{formatParamValue(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}

                    {message.action.validationMessages.length > 0 ? (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2">
                        <p className="flex items-center gap-1 text-[12px] font-semibold text-amber-800">
                          <ShieldAlert className="h-3.5 w-3.5" /> Validation warnings
                        </p>
                        <ul className="mt-1 space-y-1 text-[12px] text-amber-800">
                          {message.action.validationMessages.map((item, index) => (
                            <li key={`${message.id}:warn:${index}`}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {message.serverMessage ? (
                      <p className="mt-2 text-[12px] text-slate-600">{message.serverMessage}</p>
                    ) : null}

                    {message.resultSummary ? (
                      <div className={[
                        "mt-3 rounded-lg border p-2 text-[12px]",
                        message.state === "executed"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : message.state === "failed"
                            ? "border-red-200 bg-red-50 text-red-800"
                            : "border-slate-200 bg-slate-50 text-slate-700",
                      ].join(" ")}>
                        {message.resultSummary}
                      </div>
                    ) : null}

                    {message.state === "pending" ? (
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void decideProposal(message.id, true);
                          }}
                          disabled={!message.canExecute}
                          className="inline-flex items-center gap-1 rounded-md bg-[#28439A] px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void decideProposal(message.id, false);
                          }}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}

              {isSubmitting ? (
                <div className="flex items-center gap-2 text-[12px] text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Copilot is thinking...
                </div>
              ) : null}
            </div>

            <footer className="border-t border-slate-200 px-4 py-3">
              <div className="rounded-xl border border-slate-200 bg-white p-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={3}
                  placeholder={mode === "ask" ? "Ask about this event, budget, docs, timeline..." : "Describe an action. Copilot will propose it for approval."}
                  className="w-full resize-none border-0 bg-transparent text-[13px] text-slate-800 outline-none"
                />
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                    {mode === "ask" ? <MessageSquare className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                    {mode === "ask" ? "Read-only" : "Propose → Approve → Execute"}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void sendPrompt();
                    }}
                    disabled={isSubmitting || !draft.trim()}
                    className="inline-flex items-center gap-1 rounded-md bg-[#28439A] px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </button>
                </div>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
