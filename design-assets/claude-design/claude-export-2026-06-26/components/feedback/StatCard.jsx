import React from "react";

const TINTS = {
  primary: { bg: "var(--primary-50)", fg: "var(--primary-700)" },
  success: { bg: "var(--success-50)", fg: "var(--success-700)" },
  warning: { bg: "var(--warning-50)", fg: "var(--warning-700)" },
  info:    { bg: "var(--info-50)",    fg: "var(--info-700)" },
  neutral: { bg: "var(--surface-sunken)", fg: "var(--text-muted)" },
};

/**
 * Compact metric card — eyebrow label, big value, sublabel, tinted icon chip.
 */
export function StatCard({ label, value, sublabel, icon: Icon, tone = "primary", style }) {
  const tint = TINTS[tone] || TINTS.primary;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        padding: "18px 20px",
        background: "var(--surface-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        ...style,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: "var(--text-label)", fontWeight: "var(--weight-semibold)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase", color: "var(--text-muted)" }}>
          {label}
        </p>
        <p style={{ margin: "8px 0 0", fontSize: "var(--text-2xl)", lineHeight: 1, fontWeight: "var(--weight-bold)", color: "var(--text-strong)" }}>
          {value}
        </p>
        {sublabel ? (
          <p style={{ margin: "8px 0 0", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{sublabel}</p>
        ) : null}
      </div>
      {Icon ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: "var(--radius-md)",
            background: tint.bg,
            color: tint.fg,
            flexShrink: 0,
          }}
        >
          <Icon size={18} strokeWidth={2} />
        </span>
      ) : null}
    </div>
  );
}
