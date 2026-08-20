import React from "react";

function Glyph({ paths, size = 18, strokeWidth = 2, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
      {paths}
    </svg>
  );
}
const CheckCircle2 = (p) => <Glyph {...p} paths={<><path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" /></>} />;
const AlertTriangle = (p) => <Glyph {...p} paths={<><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>} />;
const XCircle = (p) => <Glyph {...p} paths={<><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></>} />;
const Info = (p) => <Glyph {...p} paths={<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>} />;

const TONES = {
  success: { bg: "var(--success-50)", border: "var(--success-200)", title: "var(--success-800)", body: "var(--success-700)", icon: CheckCircle2, accent: "var(--success-600)" },
  warning: { bg: "var(--warning-50)", border: "var(--warning-200)", title: "var(--warning-800)", body: "var(--warning-700)", icon: AlertTriangle, accent: "var(--warning-600)" },
  danger:  { bg: "var(--danger-50)",  border: "var(--danger-200)",  title: "var(--danger-800)",  body: "var(--danger-700)",  icon: XCircle, accent: "var(--danger-600)" },
  info:    { bg: "var(--info-50)",    border: "var(--info-200)",    title: "var(--info-800)",    body: "var(--info-700)",    icon: Info, accent: "var(--info-600)" },
  neutral: { bg: "var(--surface-card)", border: "var(--border-subtle)", title: "var(--text-heading)", body: "var(--text-muted)", icon: Info, accent: "var(--slate-400)" },
};

/**
 * Inline notice — success / warning / danger / info / neutral.
 * Optional title, body, and a right-aligned action slot.
 */
export function Alert({ tone = "info", title, children, action, showIcon = true, style }) {
  const t = TONES[tone] || TONES.info;
  const Icon = t.icon;

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "14px 16px",
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: "var(--radius-md)",
        ...style,
      }}
    >
      {showIcon ? (
        <Icon size={18} strokeWidth={2} color={t.accent} style={{ flexShrink: 0, marginTop: 1 }} />
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        {title ? (
          <p style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: "var(--weight-semibold)", color: t.title }}>
            {title}
          </p>
        ) : null}
        {children ? (
          <p style={{ margin: title ? "2px 0 0" : 0, fontSize: "var(--text-sm)", lineHeight: "var(--leading-sm)", color: t.body }}>
            {children}
          </p>
        ) : null}
      </div>
      {action ? <div style={{ flexShrink: 0 }}>{action}</div> : null}
    </div>
  );
}
