import { ChangeEvent, ComponentType, CSSProperties } from "react";

/**
 * Text input with optional leading icon and error/disabled states.
 *
 * @startingPoint section="Forms" subtitle="Inputs, selects, fields, toggles" viewport="700x150"
 */
export interface InputProps {
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  icon?: ComponentType<{ size?: number; strokeWidth?: number; style?: CSSProperties }>;
  /** Render the rose error border. @default false */
  invalid?: boolean;
  disabled?: boolean;
  /** @default "md" */
  size?: "sm" | "md";
  style?: CSSProperties;
}

export function Input(props: InputProps): JSX.Element;
