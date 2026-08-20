import React from "react";

/**
 * Segmented control — compact mode/view switcher. Active option is a
 * white pill on a sunken track.
 */
export function SegmentedControl({ items = [], value, onChange, style }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: 3,
        background: "var(--surface-sunken)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        ...style,
      }}
    >
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
              gap: 6,
              height: 30,
              padding: "0 12px",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              fontWeight: "var(--weight-semibold)",
              color: active ? "var(--text-heading)" : "var(--text-muted)",
              background: active ? "var(--surface-card)" : "transparent",
              border: "none",
              borderRadius: "var(--radius-sm)",
              boxShadow: active ? "var(--shadow-xs)" : "none",
              cursor: "pointer",
              transition: "background var(--dur-fast), color var(--dur-fast)",
            }}
          >
            {label}
            {count != null ? (
              <span style={{ fontSize: "var(--text-xs)", color: active ? "var(--text-subtle)" : "var(--text-subtle)" }}>
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
