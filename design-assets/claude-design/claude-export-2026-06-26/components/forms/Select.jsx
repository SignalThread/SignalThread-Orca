import React from "react";

function ChevronDown({ size = 18, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * Native select styled to match SignalThread inputs.
 */
export function Select({
  value,
  onChange,
  options = [],
  disabled = false,
  invalid = false,
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
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%",
          height,
          padding: "0 40px 0 14px",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-base)",
          color: "var(--text-body)",
          background: disabled ? "var(--surface-muted)" : "var(--surface-card)",
          border: `1px solid ${borderColor}`,
          borderRadius: "var(--radius-md)",
          outline: "none",
          boxShadow: focused && !invalid ? "0 0 0 3px var(--ring)" : "none",
          appearance: "none",
          WebkitAppearance: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          ...style,
        }}
        {...rest}
      >
        {options.map((opt) => {
          const o = typeof opt === "string" ? { value: opt, label: opt } : opt;
          return (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          );
        })}
      </select>
      <ChevronDown
        size={18}
        strokeWidth={2}
        style={{
          position: "absolute",
          right: 14,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--text-subtle)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
