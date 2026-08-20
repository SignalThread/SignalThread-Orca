import { CSSProperties } from "react";

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

/**
 * Count tabs for status groups, queues, and table filters.
 *
 * @startingPoint section="Navigation" subtitle="Count tabs & segmented controls" viewport="700x150"
 */
export interface TabsProps {
  items: (string | TabItem)[];
  value?: string;
  onChange?: (key: string) => void;
  style?: CSSProperties;
}

export function Tabs(props: TabsProps): JSX.Element;
