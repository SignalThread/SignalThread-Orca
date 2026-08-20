import { CSSProperties, ReactNode } from "react";

export interface DataTableColumn<T = any> {
  key: string;
  header: ReactNode;
  align?: "left" | "center" | "right";
  width?: number | string;
  /** Custom cell renderer; falls back to row[key]. */
  render?: (row: T) => ReactNode;
}

/**
 * Data table with built-in empty / loading / error states.
 *
 * @startingPoint section="Data" subtitle="Tables with empty / loading / error states" viewport="700x150"
 */
export interface DataTableProps<T = any> {
  columns: DataTableColumn<T>[];
  rows?: T[];
  /** @default "ready" */
  state?: "ready" | "loading" | "empty" | "error";
  rowKey?: (row: T, index: number) => string | number;
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
  errorTitle?: string;
  errorHint?: string;
  errorAction?: ReactNode;
  loadingRows?: number;
  style?: CSSProperties;
}

export function DataTable(props: DataTableProps): JSX.Element;
