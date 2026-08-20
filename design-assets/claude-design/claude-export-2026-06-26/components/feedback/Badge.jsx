import React from "react";

const TONES = {
  success: { bg: "var(--success-50)", border: "var(--success-200)", text: "var(--success-700)", dot: "var(--success-600)" },
  warning: { bg: "var(--warning-50)", border: "var(--warning-200)", text: "var(--warning-700)", dot: "var(--warning-600)" },
  danger:  { bg: "var(--danger-50)",  border: "var(--danger-200)",  text: "var(--danger-700)",  dot: "var(--danger-600)" },
  info:    { bg: "var(--info-50)",    border: "var(--info-200)",    text: "var(--info-700)",    dot: "var(--info-600)" },
  neutral: { bg: "var(--surface-sunken)", border: "var(--border-subtle)", text: "var(--text-muted)", dot: "var(--slate-400)" },
};

// Central status-label -> tone map (mirrors @signalthread/ui status tones).
const STATUS_TONE = {
  active: "success", approved: "success", ready: "success", completed: "success",
  draft: "warning", "in review": "warning", "needs setup": "warning", pending: "warning",
  rejected: "danger", blocked: "danger", canceled: "danger", error: "danger",
  scheduled: "info", "in progress": "info",
  unknown: "neutral",
};

/**
 * Status badge — tinted pill with a leading dot. Pass `tone`, or pass
 * `status` to resolve the tone automatically from the label.
 */
export function Badge({ children, tone, status, dot = true, style }) {
  const resolved = tone || (status ? STATUS_TONE[String(status).toLowerCase()] : null) || "neutral";
  const t = TONES[resolved] || TONES.neutral;
  const label = children ?? status;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 22,
        padding: "0 10px",
        fontSize: "var(--text-xs)",
        fontWeight: "var(--weight-semibold)",
        lineHeight: 1,
        color: t.text,
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: "var(--radius-pill)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {dot ? (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.dot, flexShrink: 0 }} />
      ) : null}
      {label}
    </span>
  );
}
