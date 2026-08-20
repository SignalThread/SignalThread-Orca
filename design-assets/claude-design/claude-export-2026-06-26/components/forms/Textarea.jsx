import React from "react";

/**
 * Multi-line text input for notes and descriptions.
 */
export function Textarea({
  value,
  onChange,
  placeholder,
  rows = 4,
  invalid = false,
  disabled = false,
  style,
  ...rest
}) {
  const [focused, setFocused] = React.useState(false);
  const borderColor = invalid
    ? "var(--danger-600)"
    : focused
    ? "var(--primary-600)"
    : "var(--border-subtle)";

  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: "100%",
        padding: "10px 14px",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-base)",
        lineHeight: "var(--leading-base)",
        color: "var(--text-body)",
        background: disabled ? "var(--surface-muted)" : "var(--surface-card)",
        border: `1px solid ${borderColor}`,
        borderRadius: "var(--radius-md)",
        outline: "none",
        resize: "vertical",
        boxShadow: focused && !invalid ? "0 0 0 3px var(--ring)" : "none",
        transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)",
        ...style,
      }}
      {...rest}
    />
  );
}
