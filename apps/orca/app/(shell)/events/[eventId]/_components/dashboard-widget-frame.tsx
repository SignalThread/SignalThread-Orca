import { GripVertical, Lock, X } from "lucide-react";
import type { ReactNode } from "react";
import type {
  EventDashboardWidgetState,
  EventDashboardWidgetType,
} from "./event-command-center-widget-registry";
import styles from "./event-command-center.module.css";

export function DashboardWidgetFrame({
  widget,
  children,
  editing = false,
  dragHandleClassName,
  onRemove,
}: {
  widget: EventDashboardWidgetState;
  children: ReactNode;
  editing?: boolean;
  /** Plain (non-CSS-module) class RGL targets as its drag handle. */
  dragHandleClassName?: string;
  onRemove?: (widgetId: EventDashboardWidgetType) => void;
}) {
  return (
    <div className={`${styles.widgetFrame} ${editing ? styles.widgetFrameEditing : ""}`}>
      {editing ? (
        <div className={styles.widgetFrameToolbar}>
          {widget.required ? (
            <span className={styles.widgetFrameHandleStatic} aria-hidden>
              <Lock className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span
              className={`${styles.widgetFrameDragHandle} ${dragHandleClassName ?? ""}`}
              aria-hidden
              title="Drag to move"
            >
              <GripVertical className="h-4 w-4" />
            </span>
          )}
          <span className={styles.widgetFrameTitle}>{widget.title}</span>
          {widget.required ? (
            <span className={styles.widgetRequiredTag}>Pinned</span>
          ) : (
            <button
              type="button"
              className={styles.widgetRemoveButton}
              aria-label={`Hide ${widget.title}`}
              title="Hide widget"
              onClick={() => onRemove?.(widget.id)}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      ) : null}
      <div className={styles.widgetFrameBody}>{children}</div>
    </div>
  );
}
