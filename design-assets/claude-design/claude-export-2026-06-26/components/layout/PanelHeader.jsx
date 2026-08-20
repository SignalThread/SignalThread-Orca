import React from "react";

/**
 * Reusable header for cards, dashboard panels, filter groups, and admin
 * sections. Keeps eyebrow, title, meta, description, and actions consistent.
 */
export function PanelHeader({ eyebrow, title, meta, description, action, style }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        ...style,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {eyebrow ? (
          <p style={{ margin: "0 0 4px", fontSize: "var(--text-label)", fontWeight: "var(--weight-semibold)", letterSpacing: "var(--tracking-wide)", textTransform: "uppercase", color: "var(--text-subtle)" }}>
            {eyebrow}
          </p>
        ) : null}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: "var(--text-lg)", lineHeight: "var(--leading-lg)", fontWeight: "var(--weight-semibold)", color: "var(--text-heading)" }}>
            {title}
          </h3>
          {meta ? (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-subtle)" }}>{meta}</span>
          ) : null}
        </div>
        {description ? (
          <p style={{ margin: "6px 0 0", fontSize: "var(--text-sm)", lineHeight: "var(--leading-sm)", color: "var(--text-muted)", maxWidth: 620 }}>
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div style={{ flexShrink: 0 }}>{action}</div> : null}
    </div>
  );
}
