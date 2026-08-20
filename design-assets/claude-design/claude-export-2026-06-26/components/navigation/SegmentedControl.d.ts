import { CSSProperties } from "react";
import { TabItem } from "./Tabs";

/** Compact segmented control for mode selectors and small view switches. */
export interface SegmentedControlProps {
  items: (string | TabItem)[];
  value?: string;
  onChange?: (key: string) => void;
  style?: CSSProperties;
}

export function SegmentedControl(props: SegmentedControlProps): JSX.Element;
