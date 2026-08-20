import React from "react";

/**
 * Text input with optional leading icon, error and disabled states.
 */
export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  icon: Icon,
  invalid = false,
  disabled = false,
  size = "md",
  style,
  ...rest
}) {
  const [focused, setFocused] = React.useState(false);
  const height = size === "sm" ? 36 : 44;

  const borderColor = invalid
    ? "var(--danger-600)"
    : focused
    ? "var(--primary-600)"
    : "var(--border-subtle)";

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {Icon ? (
        <Icon
          size={18}
          strokeWidth={2}
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-subtle)",
            pointerEvents: "none",
          }}
        />
      ) : null}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%",
          height,
          padding: Icon ? "0 14px 0 42px" : "0 14px",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-base)",
          color: "var(--text-body)",
          background: disabled ? "var(--surface-muted)" : "var(--surface-card)",
          border: `1px solid ${borderColor}`,
          borderRadius: "var(--radius-md)",
          outline: "none",
          boxShadow: focused && !invalid ? "0 0 0 3px var(--ring)" : "none",
          transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)",
          cursor: disabled ? "not-allowed" : "text",
          ...style,
        }}
        {...rest}
      />
    </div>
  );
}
