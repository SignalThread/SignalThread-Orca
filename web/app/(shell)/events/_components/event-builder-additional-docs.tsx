"use client";

import { CheckCircle2, FileText, FolderOpen, UploadCloud, XCircle } from "lucide-react";
import {
  ADDITIONAL_DOC_CATEGORY_OPTIONS,
  ADDITIONAL_DOCS_ACCEPT,
  type DocumentUploadResult,
} from "@/lib/documents-upload-client";

export type AdditionalDocItem = {
  id: string;
  file: File;
  fileName: string;
  sizeBytes: number;
  categorySlug: string;
  included: boolean;
  error: string | null;
};

function fileType(fileName: string): string {
  const extension = fileName.split(".").pop()?.toUpperCase();
  return extension || "FILE";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function categoryLabel(slug: string): string {
  return ADDITIONAL_DOC_CATEGORY_OPTIONS.find((option) => option.slug === slug)?.label ?? "Contract";
}

export function EventBuilderAdditionalDocs({
  docs,
  disabled,
  variant = "card",
  onSelectFiles,
  onRemove,
  onCategoryChange,
  onIncludeChange,
}: {
  docs: AdditionalDocItem[];
  disabled?: boolean;
  variant?: "card" | "inline";
  onSelectFiles: (files: FileList | File[] | null | undefined) => void;
  onRemove: (id: string) => void;
  onCategoryChange: (id: string, slug: string) => void;
  onIncludeChange: (id: string, included: boolean) => void;
}) {
  const shellClass =
    variant === "inline"
      ? "rounded-xl border border-slate-200 bg-slate-50 p-4"
      : "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

  return (
    <div className={shellClass}>
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-[#28439A]" aria-hidden />
        <h3 className="text-[15px] font-semibold text-slate-900">Additional documents</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Optional</span>
      </div>
      <p className="mt-1 text-[12px] text-slate-500">
        These files will be saved to Docs Hub and will not be used to generate workspace data.
      </p>

      <label
        className={`mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center hover:border-slate-400 ${
          disabled ? "pointer-events-none opacity-60" : ""
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (disabled) return;
          onSelectFiles(event.dataTransfer.files);
        }}
      >
        <UploadCloud className="h-6 w-6 text-slate-400" aria-hidden />
        <span className="text-[13px] font-medium text-slate-700">
          {docs.length > 0 ? "Add another document" : "Drop contracts or PDFs here or click to browse"}
        </span>
        <span className="text-[11px] text-slate-400">PDF, DOC/DOCX, JPG, or PNG · up to 50MB each</span>
        <input
          type="file"
          accept={ADDITIONAL_DOCS_ACCEPT}
          multiple
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            onSelectFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
      </label>

      {docs.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                doc.error ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-[#28439A]" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-slate-800">{doc.fileName}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{fileType(doc.fileName)} · Docs Hub → {categoryLabel(doc.categorySlug)}</p>
                </div>
                <p className={`mt-0.5 text-[11px] ${doc.error ? "text-rose-600" : "text-slate-500"}`}>
                  {doc.error ?? `${formatFileSize(doc.sizeBytes)} · ${doc.included ? "will be saved after creation" : "won’t be saved"}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`additional-doc-category-${doc.id}`}>
                  Document type for {doc.fileName}
                </label>
                <select
                  id={`additional-doc-category-${doc.id}`}
                  value={doc.categorySlug}
                  disabled={disabled || Boolean(doc.error) || !doc.included}
                  onChange={(event) => onCategoryChange(doc.id, event.target.value)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-medium text-slate-700 outline-none focus:border-[#28439A] disabled:opacity-60"
                >
                  {ADDITIONAL_DOC_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.slug} value={option.slug}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={doc.included}
                    disabled={disabled || Boolean(doc.error)}
                    onChange={(event) => onIncludeChange(doc.id, event.target.checked)}
                  />
                  {doc.included ? "Include" : "Don’t include"}
                </label>
                <button
                  type="button"
                  onClick={() => onRemove(doc.id)}
                  disabled={disabled}
                  className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function AdditionalDocsPreviewSummary({ docs }: { docs: AdditionalDocItem[] }) {
  const includedDocs = docs.filter((doc) => doc.included && !doc.error);
  if (includedDocs.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-[#28439A]" aria-hidden />
        <h3 className="text-[15px] font-semibold text-slate-900">Additional documents</h3>
      </div>
      <p className="mt-0.5 text-[12px] text-slate-500">
        {includedDocs.length} {includedDocs.length === 1 ? "document" : "documents"} will be saved. These files were not mapped to a workspace module. Included files will be saved to the new event&apos;s Docs Hub after the event is created.
      </p>
      <ul className="mt-3 space-y-2">
        {includedDocs.map((doc) => (
          <li
            key={doc.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-[#28439A]" aria-hidden />
              <div className="min-w-0"><p className="truncate text-[13px] font-medium text-slate-900">{doc.fileName}</p><p className="text-[11px] text-slate-500">{fileType(doc.fileName)} · Docs Hub → {categoryLabel(doc.categorySlug)}</p><p className="mt-1 text-[11px] text-slate-600">This file will be attached to the new event in Docs Hub. It will not create or update Budget, Roadmap, or Run of Show data.</p></div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdditionalDocsPostCreatePanel({
  results,
  onGoToEvent,
  onOpenDocsHub,
  onRetry,
  isRetrying,
}: {
  results: DocumentUploadResult[];
  onGoToEvent: () => void;
  onOpenDocsHub: () => void;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  const succeeded = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);
  const allSucceeded = failed.length === 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        {allSucceeded ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
        ) : (
          <XCircle className="h-5 w-5 text-amber-600" aria-hidden />
        )}
        <h2 className="text-[18px] font-semibold text-slate-900">Event created</h2>
      </div>
      <p className="mt-1 text-[13px] text-slate-600">
        {allSucceeded
          ? `Your event is ready and ${succeeded.length} ${succeeded.length === 1 ? "document was" : "documents were"} saved as ${succeeded.length === 1 ? "a draft" : "drafts"} in Docs Hub. Submit them for review there when they are ready.`
          : `Your event is ready. ${succeeded.length} of ${results.length} documents were saved as drafts in Docs Hub. Retry failed uploads here; existing drafts will be reused.`}
      </p>

      <ul className="mt-4 space-y-2">
        {results.map((result) => (
          <li
            key={result.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
              result.ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
            }`}
          >
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-slate-800">{result.fileName}</p>
              {result.ok ? (
                <p className="mt-0.5 text-[11px] text-emerald-700">Saved as Draft → {categoryLabel(result.categorySlug ?? "")} · Submit for review in Docs Hub</p>
              ) : (
                <p className="mt-0.5 text-[11px] text-amber-800">{result.error ?? "Upload failed"}</p>
              )}
            </div>
            {result.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
            ) : (
              <XCircle className="h-4 w-4 text-amber-600" aria-hidden />
            )}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {!allSucceeded ? (
          <button type="button" onClick={onRetry} disabled={isRetrying} className="inline-flex h-11 items-center rounded-xl bg-[#28439A] px-4 text-[14px] font-semibold text-white disabled:opacity-60">
            {isRetrying ? "Retrying…" : "Retry failed uploads"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onOpenDocsHub}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-[14px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          <FolderOpen className="h-4 w-4" aria-hidden />
          Open Docs Hub to review
        </button>
        <button
          type="button"
          onClick={onGoToEvent}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#28439A] px-5 text-[14px] font-semibold text-white hover:bg-[#243d8e]"
        >
          Go to event
        </button>
      </div>
    </section>
  );
}
