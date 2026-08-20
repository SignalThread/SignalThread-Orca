import React from "react";

function HeaderCell({ col }) {
  return (
    <th
      style={{
        padding: "12px 14px",
        textAlign: col.align || "left",
        fontSize: "var(--text-label)",
        lineHeight: "var(--leading-label)",
        fontWeight: "var(--weight-semibold)",
        letterSpacing: "var(--tracking-wide)",
        textTransform: "uppercase",
        color: "var(--text-muted)",
        whiteSpace: "nowrap",
        width: col.width,
      }}
    >
      {col.header}
    </th>
  );
}

function StateRow({ colSpan, children }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0 }}>
        {children}
      </td>
    </tr>
  );
}

/**
 * Data table with built-in empty / loading / error states. Columns declare
 * header, alignment, width, and an optional cell renderer.
 */
export function DataTable({
  columns = [],
  rows = [],
  state = "ready",
  rowKey = (r, i) => r.id ?? i,
  emptyTitle = "No results found",
  emptyHint = "Try clearing filters.",
  emptyAction,
  errorTitle = "Rows could not load",
  errorHint = "The table keeps its frame while surfacing the error.",
  errorAction,
  loadingRows = 4,
  style,
}) {
  const span = columns.length || 1;

  return (
    <div
      style={{
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        background: "var(--surface-card)",
        ...style,
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {columns.map((c) => (
              <HeaderCell key={c.key} col={c} />
            ))}
          </tr>
        </thead>
        <tbody>
          {state === "ready" &&
            rows.map((row, i) => (
              <tr key={rowKey(row, i)} style={{ borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--border-subtle)" }}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    style={{
                      padding: "12px 14px",
                      textAlign: c.align || "left",
                      fontSize: "var(--text-sm)",
                      lineHeight: "var(--leading-sm)",
                      color: "var(--text-body)",
                      verticalAlign: "middle",
                    }}
                  >
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}

          {state === "loading" &&
            Array.from({ length: loadingRows }).map((_, i) => (
              <tr key={i} style={{ borderBottom: i === loadingRows - 1 ? "none" : "1px solid var(--border-subtle)" }}>
                {columns.map((c) => (
                  <td key={c.key} style={{ padding: "14px 14px" }}>
                    <span
                      style={{
                        display: "block",
                        height: 10,
                        width: `${50 + ((i + c.key.length) % 4) * 12}%`,
                        borderRadius: "var(--radius-pill)",
                        background: "linear-gradient(90deg, var(--slate-100), var(--slate-200), var(--slate-100))",
                        backgroundSize: "200% 100%",
                        animation: "st-shimmer 1.4s ease-in-out infinite",
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}

          {state === "empty" && (
            <StateRow colSpan={span}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "44px 20px", textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: "var(--weight-semibold)", color: "var(--text-heading)" }}>{emptyTitle}</p>
                <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{emptyHint}</p>
                {emptyAction ? <div style={{ marginTop: 4 }}>{emptyAction}</div> : null}
              </div>
            </StateRow>
          )}

          {state === "error" && (
            <StateRow colSpan={span}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "40px 20px", margin: 12, textAlign: "center", background: "var(--danger-50)", border: "1px solid var(--danger-200)", borderRadius: "var(--radius-md)" }}>
                <p style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: "var(--weight-semibold)", color: "var(--danger-700)" }}>{errorTitle}</p>
                <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--danger-700)" }}>{errorHint}</p>
                {errorAction ? <div style={{ marginTop: 4 }}>{errorAction}</div> : null}
              </div>
            </StateRow>
          )}
        </tbody>
      </table>
      <style>{"@keyframes st-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}"}</style>
    </div>
  );
}
