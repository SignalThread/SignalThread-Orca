import React from "react";

/**
 * Toggle switch for binary settings.
 */
export function Switch({ checked = false, onChange, label, disabled = false, style }) {
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
          position: "relative",
          width: 40,
          height: 24,
          borderRadius: "var(--radius-pill)",
          background: checked ? "var(--accent-primary)" : "var(--slate-300)",
          transition: "background var(--dur-base) var(--ease-standard)",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 18 : 2,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "var(--shadow-sm)",
            transition: "left var(--dur-base) var(--ease-standard)",
          }}
        />
      </span>
      {label ? (
        <span style={{ fontSize: "var(--text-base)", color: "var(--text-body)" }}>{label}</span>
      ) : null}
    </label>
  );
}
