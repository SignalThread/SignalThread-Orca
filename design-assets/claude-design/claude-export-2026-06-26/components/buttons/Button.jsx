import React from "react";

const SIZES = {
  sm: { height: 36, padding: "0 14px", fontSize: "var(--text-sm)", gap: 6, icon: 16 },
  md: { height: 44, padding: "0 20px", fontSize: "var(--text-base)", gap: 8, icon: 18 },
};

function variantStyle(variant, hovered, disabled) {
  const base = { border: "1px solid transparent" };
  switch (variant) {
    case "secondary":
      return {
        ...base,
        background: hovered && !disabled ? "var(--surface-muted)" : "var(--surface-card)",
        borderColor: "var(--border-subtle)",
        color: "var(--text-body)",
      };
    case "ghost":
      return {
        ...base,
        background: hovered && !disabled ? "var(--surface-sunken)" : "transparent",
        color: "var(--text-body)",
      };
    case "danger":
      return {
        ...base,
        background: hovered && !disabled ? "var(--danger-700)" : "var(--danger-600)",
        color: "#fff",
      };
    case "primary":
    default:
      return {
        ...base,
        background: hovered && !disabled ? "var(--accent-primary-hover)" : "var(--accent-primary)",
        color: "var(--text-on-primary)",
      };
  }
}

/**
 * SignalThread primary action button.
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  icon: Icon,
  iconRight = false,
  disabled = false,
  loading = false,
  type = "button",
  onClick,
  style,
  ...rest
}) {
  const [hovered, setHovered] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: s.gap,
        height: s.height,
        padding: s.padding,
        fontFamily: "var(--font-sans)",
        fontSize: s.fontSize,
        fontWeight: "var(--weight-semibold)",
        lineHeight: 1,
        borderRadius: "var(--radius-lg)",
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.6 : 1,
        transition: "background var(--dur-fast) var(--ease-standard)",
        whiteSpace: "nowrap",
        ...variantStyle(variant, hovered, isDisabled),
        ...style,
      }}
      {...rest}
    >
      {Icon && !iconRight ? <Icon size={s.icon} strokeWidth={2} /> : null}
      {children}
      {Icon && iconRight ? <Icon size={s.icon} strokeWidth={2} /> : null}
    </button>
  );
}
