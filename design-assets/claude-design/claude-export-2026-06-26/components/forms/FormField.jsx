import React from "react";

/**
 * Field wrapper: label (+ required), control slot, helper or error text.
 * Mirrors @signalthread/ui FormField.
 */
export function FormField({ label, required = false, helper, error, htmlFor, children, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {label ? (
        <label
          htmlFor={htmlFor}
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: "var(--weight-medium)",
            color: "var(--text-body)",
          }}
        >
          {label}
          {required ? <span style={{ color: "var(--danger-600)", marginLeft: 3 }}>*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--danger-600)" }}>{error}</p>
      ) : helper ? (
        <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{helper}</p>
      ) : null}
    </div>
  );
}
