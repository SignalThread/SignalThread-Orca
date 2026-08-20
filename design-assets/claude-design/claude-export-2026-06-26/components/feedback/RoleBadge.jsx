import React from "react";

const ROLE_TONES = {
  elevated: { bg: "var(--violet-50)", border: "var(--violet-200)", text: "var(--violet-700)" },
  admin:    { bg: "var(--info-50)",   border: "var(--info-200)",   text: "var(--info-700)" },
  member:   { bg: "var(--surface-sunken)", border: "var(--border-subtle)", text: "var(--text-muted)" },
};

// Role key -> tone group.
const ROLE_MAP = {
  "super admin": "elevated", super_admin: "elevated", owner: "elevated",
  admin: "admin", "event editor": "admin", event_editor: "admin",
  member: "member", viewer: "member",
};

function pretty(role) {
  return String(role).replace(/_/g, " ").toUpperCase();
}

/**
 * Role badge — solid-tinted uppercase pill keyed by role.
 */
export function RoleBadge({ role, style }) {
  const group = ROLE_MAP[String(role).toLowerCase()] || "member";
  const t = ROLE_TONES[group];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 22,
        padding: "0 10px",
        fontSize: "var(--text-xs)",
        fontWeight: "var(--weight-semibold)",
        letterSpacing: "var(--tracking-wide)",
        lineHeight: 1,
        color: t.text,
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: "var(--radius-pill)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {pretty(role)}
    </span>
  );
}
