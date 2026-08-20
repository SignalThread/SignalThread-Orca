import { CSSProperties } from "react";

/** Toggle switch for binary settings. */
export interface SwitchProps {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
  style?: CSSProperties;
}

export function Switch(props: SwitchProps): JSX.Element;
