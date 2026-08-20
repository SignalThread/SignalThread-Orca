import React from "react";

/**
 * Surface card — white, slate-200 border, 16px radius, whisper shadow.
 * The default container for panels and grouped content.
 */
export function Card({ children, padding = 20, interactive = false, style }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onMouseEnter={() => interactive && setHovered(true)}
      onMouseLeave={() => interactive && setHovered(false)}
      style={{
        background: "var(--surface-card)",
        border: `1px solid ${hovered ? "var(--border-strong)" : "var(--border-subtle)"}`,
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        padding,
        transition: "border-color var(--dur-fast)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
