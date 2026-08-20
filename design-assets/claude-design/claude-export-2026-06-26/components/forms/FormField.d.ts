import { CSSProperties, ReactNode } from "react";

/** Field wrapper: label (+required), control slot, helper or error text. */
export interface FormFieldProps {
  label?: string;
  required?: boolean;
  /** Muted helper text below the control. */
  helper?: string;
  /** Rose error text — takes precedence over helper. */
  error?: string;
  htmlFor?: string;
  children?: ReactNode;
  style?: CSSProperties;
}

export function FormField(props: FormFieldProps): JSX.Element;
