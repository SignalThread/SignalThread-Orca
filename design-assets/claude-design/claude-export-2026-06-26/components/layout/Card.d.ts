import { CSSProperties, ReactNode } from "react";

/**
 * Surface card — the default container for grouped content.
 *
 * @startingPoint section="Layout" subtitle="Cards & panel headers" viewport="700x150"
 */
export interface CardProps {
  children?: ReactNode;
  /** Inner padding in px. @default 20 */
  padding?: number;
  /** Darken the border on hover (for clickable cards). @default false */
  interactive?: boolean;
  style?: CSSProperties;
}

export function Card(props: CardProps): JSX.Element;
