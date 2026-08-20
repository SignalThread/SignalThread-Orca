import { ChangeEvent, CSSProperties } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

/** Native select styled to match SignalThread inputs. */
export interface SelectProps {
  value?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  /** Options as plain strings or {value,label}. */
  options?: (string | SelectOption)[];
  disabled?: boolean;
  invalid?: boolean;
  size?: "sm" | "md";
  style?: CSSProperties;
}

export function Select(props: SelectProps): JSX.Element;
