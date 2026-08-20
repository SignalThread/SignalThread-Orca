import { CSSProperties } from "react";

/** Checkbox with optional label. */
export interface CheckboxProps {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
  style?: CSSProperties;
}

export function Checkbox(props: CheckboxProps): JSX.Element;
