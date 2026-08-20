import React from "react";

function Check({ size = 14, strokeWidth = 3, color = "#fff" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * Checkbox with label.
 */
export function Checkbox({ checked = false, onChange, label, disabled = false, style }) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <span
        onClick={() => !disabled && onChange && onChange(!checked)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 20,
          height: 20,
          borderRadius: 6,
          border: `1.5px solid ${checked ? "var(--accent-primary)" : "var(--border-strong)"}`,
          background: checked ? "var(--accent-primary)" : "var(--surface-card)",
          transition: "background var(--dur-fast), border-color var(--dur-fast)",
        }}
      >
        {checked ? <Check size={14} strokeWidth={3} color="#fff" /> : null}
      </span>
      {label ? (
        <span style={{ fontSize: "var(--text-base)", color: "var(--text-body)" }}>{label}</span>
      ) : null}
    </label>
  );
}
