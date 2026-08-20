import { CSSProperties } from "react";

/** Role badge — uppercase tinted pill keyed by role. */
export interface RoleBadgeProps {
  /** Role key: SUPER_ADMIN, OWNER, ADMIN, EVENT_EDITOR, MEMBER, VIEWER. */
  role: string;
  style?: CSSProperties;
}

export function RoleBadge(props: RoleBadgeProps): JSX.Element;
