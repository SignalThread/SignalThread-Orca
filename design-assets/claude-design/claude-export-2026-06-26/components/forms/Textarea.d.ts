import { ChangeEvent, CSSProperties } from "react";

/** Multi-line text input for notes and descriptions. */
export interface TextareaProps {
  value?: string;
  onChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  invalid?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
}

export function Textarea(props: TextareaProps): JSX.Element;
