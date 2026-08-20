import React from "react";

/**
 * Count tabs — button-style tabs with optional count pills.
 * Active tab fills with primary; counts ride in a contrast pill.
 */
export function Tabs({ items = [], value, onChange, style }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, ...style }}>
      {items.map((item) => {
        const key = typeof item === "string" ? item : item.key;
        const label = typeof item === "string" ? item : item.label;
        const count = typeof item === "string" ? undefined : item.count;
        const active = key === value;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange && onChange(key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 36,
              padding: "0 14px",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              fontWeight: "var(--weight-semibold)",
              color: active ? "var(--text-on-primary)" : "var(--text-body)",
              background: active ? "var(--accent-primary)" : "var(--surface-card)",
              border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              transition: "background var(--dur-fast), color var(--dur-fast)",
            }}
          >
            {label}
            {count != null ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 20,
                  height: 18,
                  padding: "0 6px",
                  fontSize: "var(--text-xs)",
                  fontWeight: "var(--weight-semibold)",
                  borderRadius: "var(--radius-pill)",
                  color: active ? "var(--text-on-primary)" : "var(--text-muted)",
                  background: active ? "rgba(255,255,255,0.22)" : "var(--surface-sunken)",
                }}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
