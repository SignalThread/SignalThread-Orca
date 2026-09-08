"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { TEMPLATE_VARIABLES } from "@/lib/data/email-templates";
import { PageHeader, PageShell } from "@/components/layout/page-header";

type EmailTemplate = {
  id: string;
  account_id: string;
  name: string;
  subject: string;
  body: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

type EmailTemplatesResponse = {
  templates?: EmailTemplate[];
  error?: string;
  success?: boolean;
};

type EditorState = {
  mode: "create" | "edit";
  templateId: string | null;
  name: string;
  subject: string;
  body: string;
  isDefault: boolean;
};

function formatUpdatedAt(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function emptyEditorState(): EditorState {
  return {
    mode: "create",
    templateId: null,
    name: "",
    subject: "",
    body: "",
    isDefault: false,
  };
}

export function ExhibitorEmailTemplatesClient({ embedded = false }: { embedded?: boolean }) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const [editorState, setEditorState] = useState<EditorState>(emptyEditorState());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSubmitting, setEditorSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<EmailTemplate | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const sortedTemplates = useMemo(
    () => {
      const normalizedQuery = searchQuery.trim().toLowerCase();
      return templates
        .filter(
          (template) =>
            !normalizedQuery ||
            template.name.toLowerCase().includes(normalizedQuery) ||
            template.subject.toLowerCase().includes(normalizedQuery),
        )
        .sort((a, b) => Number(b.is_default) - Number(a.is_default) || b.updated_at.localeCompare(a.updated_at));
    },
    [searchQuery, templates]
  );

  async function loadTemplates(): Promise<EmailTemplate[] | null> {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/exhibitor/email-templates", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as EmailTemplatesResponse;
      if (!response.ok) {
        setErrorMessage(payload.error ?? "Failed to load email templates.");
        return null;
      }

      const nextTemplates = payload.templates ?? [];
      setTemplates(nextTemplates);
      return nextTemplates;
    } catch {
      setErrorMessage("Failed to load email templates.");
      return null;
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    if (!noticeMessage) return;
    const timer = setTimeout(() => setNoticeMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [noticeMessage]);

  function openCreateModal() {
    setEditorState(emptyEditorState());
    setEditorOpen(true);
  }

  function openEditModal(template: EmailTemplate) {
    setEditorState({
      mode: "edit",
      templateId: template.id,
      name: template.name,
      subject: template.subject,
      body: template.body,
      isDefault: template.is_default,
    });
    setEditorOpen(true);
  }

  async function handleSaveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editorSubmitting) return;

    setEditorSubmitting(true);
    setErrorMessage(null);

    try {
      const endpoint =
        editorState.mode === "create"
          ? "/api/exhibitor/email-templates"
          : `/api/exhibitor/email-templates/${encodeURIComponent(String(editorState.templateId ?? ""))}`;

      const response = await fetch(endpoint, {
        method: editorState.mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editorState.name,
          subject: editorState.subject,
          body: editorState.body,
          isDefault: editorState.isDefault,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setErrorMessage(payload.error ?? "Failed to save template.");
        return;
      }

      setEditorOpen(false);
      setNoticeMessage(editorState.mode === "create" ? "Template created." : "Template updated.");
      await loadTemplates();
    } finally {
      setEditorSubmitting(false);
    }
  }

  async function handleDuplicateTemplate(templateId: string) {
    setErrorMessage(null);

    const response = await fetch(
      `/api/exhibitor/email-templates/${encodeURIComponent(templateId)}/duplicate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setErrorMessage(payload.error ?? "Failed to duplicate template.");
      return;
    }

    setNoticeMessage("Template duplicated.");
    await loadTemplates();
  }

  async function handleDeleteTemplate() {
    if (!deleteTarget || deleteSubmitting) return;

    setDeleteSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/exhibitor/email-templates/${encodeURIComponent(deleteTarget.id)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        }
      );

      const payload = (await response.json().catch(() => ({}))) as EmailTemplatesResponse;
      if (!response.ok) {
        setErrorMessage(payload.error ?? "Failed to delete template.");
        return;
      }

      const deletedTemplateId = deleteTarget.id;
      const deletedTemplates = payload.templates;
      if (!deletedTemplates || deletedTemplates.some((template) => template.id === deletedTemplateId)) {
        setErrorMessage("Template deletion could not be confirmed.");
        return;
      }

      // The mutation response is a server-side read after deletion. Refresh through the
      // list endpoint as well, so the rendered state cannot come from a stale cache.
      setTemplates(deletedTemplates);
      const refreshedTemplates = await loadTemplates();
      if (!refreshedTemplates || refreshedTemplates.some((template) => template.id === deletedTemplateId)) {
        setErrorMessage("Template deletion could not be confirmed after refreshing the list.");
        return;
      }

      setDeleteTarget(null);
      setNoticeMessage("Template deleted.");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const newTemplateAction = (
    <button
      type="button"
      onClick={openCreateModal}
      className="inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700"
    >
      New Template
    </button>
  );

  const content = (
    <>
      {embedded ? (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Create and manage the email templates your team uses when sending resources to leads.
          </p>
          {newTemplateAction}
        </div>
      ) : null}

      {errorMessage ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {errorMessage}
        </p>
      ) : null}

      {noticeMessage ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {noticeMessage}
        </p>
      ) : null}

      <div className="mb-5 max-w-xl">
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search email templates by name or subject..."
          aria-label="Search email templates"
          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-500 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {isLoading ? (
          <div className="p-6 text-sm text-slate-600">Loading templates...</div>
        ) : sortedTemplates.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">No templates found.</div>
        ) : (
          <table className="w-full table-auto text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-800">
              <tr>
                <th className="px-5 py-3.5 text-sm font-semibold">Template Name</th>
                <th className="px-4 py-3.5 text-sm font-semibold">Subject</th>
                <th className="px-4 py-3.5 text-sm font-semibold">Last Updated</th>
                <th className="px-4 py-3.5 text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTemplates.map((template) => (
                <tr key={template.id} className="border-t border-slate-200">
                  <td className="px-5 py-3.5 text-sm font-semibold text-slate-900">
                    <div className="flex items-center gap-2">
                      <span>{template.name}</span>
                      {template.is_default ? (
                        <span className="inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                          Default
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-slate-700">{template.subject}</td>
                  <td className="px-4 py-3.5 text-sm text-slate-700">{formatUpdatedAt(template.updated_at)}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(template)}
                        className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDuplicateTemplate(template.id)}
                        className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(template)}
                        className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {editorState.mode === "create" ? "Create Template" : "Edit Template"}
              </h2>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                Close
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleSaveTemplate}>
              <div className="space-y-1.5">
                <label htmlFor="email-template-name" className="text-sm font-medium text-slate-700">Template Name</label>
                <input
                  id="email-template-name"
                  type="text"
                  required
                  value={editorState.name}
                  onChange={(event) =>
                    setEditorState((current) => ({ ...current, name: event.target.value }))
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="email-template-subject" className="text-sm font-medium text-slate-700">Subject</label>
                <input
                  id="email-template-subject"
                  type="text"
                  required
                  value={editorState.subject}
                  onChange={(event) =>
                    setEditorState((current) => ({ ...current, subject: event.target.value }))
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="email-template-body" className="text-sm font-medium text-slate-700">Email Body</label>
                <textarea
                  id="email-template-body"
                  required
                  rows={10}
                  value={editorState.body}
                  onChange={(event) =>
                    setEditorState((current) => ({ ...current, body: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supported Variables</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {TEMPLATE_VARIABLES.map((token) => (
                      <code
                        key={token}
                        className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        {token}
                      </code>
                    ))}
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editorState.isDefault}
                  onChange={(event) =>
                    setEditorState((current) => ({ ...current, isDefault: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                Set as default template
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="h-10 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  disabled={editorSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editorSubmitting}
                  className="h-10 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-3 text-sm font-semibold text-white hover:from-indigo-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {editorSubmitting ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Delete Template</h2>
            <p className="mt-2 text-sm text-slate-700">
              This template will be permanently removed for your company.
            </p>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
              {deleteTarget.name}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="h-10 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                disabled={deleteSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteTemplate()}
                disabled={deleteSubmitting}
                className="h-10 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleteSubmitting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  if (embedded) return content;

  return (
    <PageShell>
      <PageHeader
        title="Email Templates"
        subtitle="Manage account-scoped templates used by Send Resources."
        actions={newTemplateAction}
      />
      {content}
    </PageShell>
  );
}
