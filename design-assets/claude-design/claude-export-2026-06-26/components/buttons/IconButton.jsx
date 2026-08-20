import React from "react";

/**
 * Square icon-only button — toolbar actions, close, overflow menus.
 */
export function IconButton({
  icon: Icon,
  label,
  variant = "ghost",
  size = "md",
  disabled = false,
  onClick,
  style,
  ...rest
}) {
  const [hovered, setHovered] = React.useState(false);
  const dim = size === "sm" ? 32 : 40;
  const iconSize = size === "sm" ? 16 : 18;

  const variants = {
    ghost: {
      background: hovered && !disabled ? "var(--surface-sunken)" : "transparent",
      color: "var(--text-muted)",
      border: "1px solid transparent",
    },
    outline: {
      background: hovered && !disabled ? "var(--surface-muted)" : "var(--surface-card)",
      color: "var(--text-body)",
      border: "1px solid var(--border-subtle)",
    },
  };

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: dim,
        height: dim,
        borderRadius: "var(--radius-md)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background var(--dur-fast) var(--ease-standard)",
        ...(variants[variant] || variants.ghost),
        ...style,
      }}
      {...rest}
    >
      {Icon ? <Icon size={iconSize} strokeWidth={2} /> : null}
    </button>
  );
}
