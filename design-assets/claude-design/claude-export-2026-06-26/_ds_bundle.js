/* @ds-bundle: {"format":3,"namespace":"SignalThreadDesignSystem_204ca3","components":[{"name":"Button","sourcePath":"components/buttons/Button.jsx"},{"name":"IconButton","sourcePath":"components/buttons/IconButton.jsx"},{"name":"DataTable","sourcePath":"components/data/DataTable.jsx"},{"name":"Alert","sourcePath":"components/feedback/Alert.jsx"},{"name":"Badge","sourcePath":"components/feedback/Badge.jsx"},{"name":"RoleBadge","sourcePath":"components/feedback/RoleBadge.jsx"},{"name":"StatCard","sourcePath":"components/feedback/StatCard.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"FormField","sourcePath":"components/forms/FormField.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"Card","sourcePath":"components/layout/Card.jsx"},{"name":"PanelHeader","sourcePath":"components/layout/PanelHeader.jsx"},{"name":"SegmentedControl","sourcePath":"components/navigation/SegmentedControl.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/buttons/Button.jsx":"fcdf043ee27f","components/buttons/IconButton.jsx":"ba699f5d7829","components/data/DataTable.jsx":"f6e10cf6a776","components/feedback/Alert.jsx":"f6a4271330ad","components/feedback/Badge.jsx":"01ecca134cc4","components/feedback/RoleBadge.jsx":"d1cfd01c670a","components/feedback/StatCard.jsx":"74e993bb3616","components/forms/Checkbox.jsx":"a4820f88c0cd","components/forms/FormField.jsx":"ff6c13d8afd3","components/forms/Input.jsx":"979097a0d184","components/forms/Select.jsx":"1f6b364f19c1","components/forms/Switch.jsx":"1d12b09a683f","components/forms/Textarea.jsx":"3827a4a5332a","components/layout/Card.jsx":"fe9c8b089d40","components/layout/PanelHeader.jsx":"516184b61452","components/navigation/SegmentedControl.jsx":"ba2d62e20952","components/navigation/Tabs.jsx":"966f2c4dbd2d","ui_kits/planner-dash/App.jsx":"385720ccaeb3","ui_kits/planner-dash/EventsScreen.jsx":"e5a6b137465d","ui_kits/planner-dash/LoginScreen.jsx":"a87b1a335a31","ui_kits/planner-dash/PlatformUsersScreen.jsx":"4817b739ba03","ui_kits/planner-dash/Shell.jsx":"80ee836f4f2a","ui_kits/planner-dash/icons.jsx":"e9fb1a0fbaa3"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.SignalThreadDesignSystem_204ca3 = window.SignalThreadDesignSystem_204ca3 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/buttons/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  sm: {
    height: 36,
    padding: "0 14px",
    fontSize: "var(--text-sm)",
    gap: 6,
    icon: 16
  },
  md: {
    height: 44,
    padding: "0 20px",
    fontSize: "var(--text-base)",
    gap: 8,
    icon: 18
  }
};
function variantStyle(variant, hovered, disabled) {
  const base = {
    border: "1px solid transparent"
  };
  switch (variant) {
    case "secondary":
      return {
        ...base,
        background: hovered && !disabled ? "var(--surface-muted)" : "var(--surface-card)",
        borderColor: "var(--border-subtle)",
        color: "var(--text-body)"
      };
    case "ghost":
      return {
        ...base,
        background: hovered && !disabled ? "var(--surface-sunken)" : "transparent",
        color: "var(--text-body)"
      };
    case "danger":
      return {
        ...base,
        background: hovered && !disabled ? "var(--danger-700)" : "var(--danger-600)",
        color: "#fff"
      };
    case "primary":
    default:
      return {
        ...base,
        background: hovered && !disabled ? "var(--accent-primary-hover)" : "var(--accent-primary)",
        color: "var(--text-on-primary)"
      };
  }
}

/**
 * SignalThread primary action button.
 */
function Button({
  children,
  variant = "primary",
  size = "md",
  icon: Icon,
  iconRight = false,
  disabled = false,
  loading = false,
  type = "button",
  onClick,
  style,
  ...rest
}) {
  const [hovered, setHovered] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const isDisabled = disabled || loading;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    onClick: onClick,
    disabled: isDisabled,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: s.gap,
      height: s.height,
      padding: s.padding,
      fontFamily: "var(--font-sans)",
      fontSize: s.fontSize,
      fontWeight: "var(--weight-semibold)",
      lineHeight: 1,
      borderRadius: "var(--radius-lg)",
      cursor: isDisabled ? "not-allowed" : "pointer",
      opacity: isDisabled ? 0.6 : 1,
      transition: "background var(--dur-fast) var(--ease-standard)",
      whiteSpace: "nowrap",
      ...variantStyle(variant, hovered, isDisabled),
      ...style
    }
  }, rest), Icon && !iconRight ? /*#__PURE__*/React.createElement(Icon, {
    size: s.icon,
    strokeWidth: 2
  }) : null, children, Icon && iconRight ? /*#__PURE__*/React.createElement(Icon, {
    size: s.icon,
    strokeWidth: 2
  }) : null);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Button.jsx", error: String((e && e.message) || e) }); }

// components/buttons/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Square icon-only button — toolbar actions, close, overflow menus.
 */
function IconButton({
  icon: Icon,
  label,
  variant = "ghost",
  size = "md",
  disabled = false,
  onClick,
  style,
  ...rest
}) {
  const [hovered, setHovered] = React.useState(false);
  const dim = size === "sm" ? 32 : 40;
  const iconSize = size === "sm" ? 16 : 18;
  const variants = {
    ghost: {
      background: hovered && !disabled ? "var(--surface-sunken)" : "transparent",
      color: "var(--text-muted)",
      border: "1px solid transparent"
    },
    outline: {
      background: hovered && !disabled ? "var(--surface-muted)" : "var(--surface-card)",
      color: "var(--text-body)",
      border: "1px solid var(--border-subtle)"
    }
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": label,
    title: label,
    onClick: onClick,
    disabled: disabled,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: dim,
      height: dim,
      borderRadius: "var(--radius-md)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: "background var(--dur-fast) var(--ease-standard)",
      ...(variants[variant] || variants.ghost),
      ...style
    }
  }, rest), Icon ? /*#__PURE__*/React.createElement(Icon, {
    size: iconSize,
    strokeWidth: 2
  }) : null);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/data/DataTable.jsx
try { (() => {
function HeaderCell({
  col
}) {
  return /*#__PURE__*/React.createElement("th", {
    style: {
      padding: "12px 14px",
      textAlign: col.align || "left",
      fontSize: "var(--text-label)",
      lineHeight: "var(--leading-label)",
      fontWeight: "var(--weight-semibold)",
      letterSpacing: "var(--tracking-wide)",
      textTransform: "uppercase",
      color: "var(--text-muted)",
      whiteSpace: "nowrap",
      width: col.width
    }
  }, col.header);
}
function StateRow({
  colSpan,
  children
}) {
  return /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: colSpan,
    style: {
      padding: 0
    }
  }, children));
}

/**
 * Data table with built-in empty / loading / error states. Columns declare
 * header, alignment, width, and an optional cell renderer.
 */
function DataTable({
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
  style
}) {
  const span = columns.length || 1;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
      background: "var(--surface-card)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, columns.map(c => /*#__PURE__*/React.createElement(HeaderCell, {
    key: c.key,
    col: c
  })))), /*#__PURE__*/React.createElement("tbody", null, state === "ready" && rows.map((row, i) => /*#__PURE__*/React.createElement("tr", {
    key: rowKey(row, i),
    style: {
      borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--border-subtle)"
    }
  }, columns.map(c => /*#__PURE__*/React.createElement("td", {
    key: c.key,
    style: {
      padding: "12px 14px",
      textAlign: c.align || "left",
      fontSize: "var(--text-sm)",
      lineHeight: "var(--leading-sm)",
      color: "var(--text-body)",
      verticalAlign: "middle"
    }
  }, c.render ? c.render(row) : row[c.key])))), state === "loading" && Array.from({
    length: loadingRows
  }).map((_, i) => /*#__PURE__*/React.createElement("tr", {
    key: i,
    style: {
      borderBottom: i === loadingRows - 1 ? "none" : "1px solid var(--border-subtle)"
    }
  }, columns.map(c => /*#__PURE__*/React.createElement("td", {
    key: c.key,
    style: {
      padding: "14px 14px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      height: 10,
      width: `${50 + (i + c.key.length) % 4 * 12}%`,
      borderRadius: "var(--radius-pill)",
      background: "linear-gradient(90deg, var(--slate-100), var(--slate-200), var(--slate-100))",
      backgroundSize: "200% 100%",
      animation: "st-shimmer 1.4s ease-in-out infinite"
    }
  }))))), state === "empty" && /*#__PURE__*/React.createElement(StateRow, {
    colSpan: span
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      padding: "44px 20px",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "var(--text-base)",
      fontWeight: "var(--weight-semibold)",
      color: "var(--text-heading)"
    }
  }, emptyTitle), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "var(--text-sm)",
      color: "var(--text-muted)"
    }
  }, emptyHint), emptyAction ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, emptyAction) : null)), state === "error" && /*#__PURE__*/React.createElement(StateRow, {
    colSpan: span
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      padding: "40px 20px",
      margin: 12,
      textAlign: "center",
      background: "var(--danger-50)",
      border: "1px solid var(--danger-200)",
      borderRadius: "var(--radius-md)"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "var(--text-base)",
      fontWeight: "var(--weight-semibold)",
      color: "var(--danger-700)"
    }
  }, errorTitle), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "var(--text-sm)",
      color: "var(--danger-700)"
    }
  }, errorHint), errorAction ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, errorAction) : null)))), /*#__PURE__*/React.createElement("style", null, "@keyframes st-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}"));
}
Object.assign(__ds_scope, { DataTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/DataTable.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Alert.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Glyph({
  paths,
  size = 18,
  strokeWidth = 2,
  color
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      flexShrink: 0,
      marginTop: 1
    }
  }, paths);
}
const CheckCircle2 = p => /*#__PURE__*/React.createElement(Glyph, _extends({}, p, {
  paths: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M21.801 10A10 10 0 1 1 17 3.335"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m9 11 3 3L22 4"
  }))
}));
const AlertTriangle = p => /*#__PURE__*/React.createElement(Glyph, _extends({}, p, {
  paths: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 9v4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 17h.01"
  }))
}));
const XCircle = p => /*#__PURE__*/React.createElement(Glyph, _extends({}, p, {
  paths: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m15 9-6 6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m9 9 6 6"
  }))
}));
const Info = p => /*#__PURE__*/React.createElement(Glyph, _extends({}, p, {
  paths: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 16v-4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 8h.01"
  }))
}));
const TONES = {
  success: {
    bg: "var(--success-50)",
    border: "var(--success-200)",
    title: "var(--success-800)",
    body: "var(--success-700)",
    icon: CheckCircle2,
    accent: "var(--success-600)"
  },
  warning: {
    bg: "var(--warning-50)",
    border: "var(--warning-200)",
    title: "var(--warning-800)",
    body: "var(--warning-700)",
    icon: AlertTriangle,
    accent: "var(--warning-600)"
  },
  danger: {
    bg: "var(--danger-50)",
    border: "var(--danger-200)",
    title: "var(--danger-800)",
    body: "var(--danger-700)",
    icon: XCircle,
    accent: "var(--danger-600)"
  },
  info: {
    bg: "var(--info-50)",
    border: "var(--info-200)",
    title: "var(--info-800)",
    body: "var(--info-700)",
    icon: Info,
    accent: "var(--info-600)"
  },
  neutral: {
    bg: "var(--surface-card)",
    border: "var(--border-subtle)",
    title: "var(--text-heading)",
    body: "var(--text-muted)",
    icon: Info,
    accent: "var(--slate-400)"
  }
};

/**
 * Inline notice — success / warning / danger / info / neutral.
 * Optional title, body, and a right-aligned action slot.
 */
function Alert({
  tone = "info",
  title,
  children,
  action,
  showIcon = true,
  style
}) {
  const t = TONES[tone] || TONES.info;
  const Icon = t.icon;
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
      padding: "14px 16px",
      background: t.bg,
      border: `1px solid ${t.border}`,
      borderRadius: "var(--radius-md)",
      ...style
    }
  }, showIcon ? /*#__PURE__*/React.createElement(Icon, {
    size: 18,
    strokeWidth: 2,
    color: t.accent,
    style: {
      flexShrink: 0,
      marginTop: 1
    }
  }) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, title ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "var(--text-base)",
      fontWeight: "var(--weight-semibold)",
      color: t.title
    }
  }, title) : null, children ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: title ? "2px 0 0" : 0,
      fontSize: "var(--text-sm)",
      lineHeight: "var(--leading-sm)",
      color: t.body
    }
  }, children) : null), action ? /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0
    }
  }, action) : null);
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Alert.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Badge.jsx
try { (() => {
const TONES = {
  success: {
    bg: "var(--success-50)",
    border: "var(--success-200)",
    text: "var(--success-700)",
    dot: "var(--success-600)"
  },
  warning: {
    bg: "var(--warning-50)",
    border: "var(--warning-200)",
    text: "var(--warning-700)",
    dot: "var(--warning-600)"
  },
  danger: {
    bg: "var(--danger-50)",
    border: "var(--danger-200)",
    text: "var(--danger-700)",
    dot: "var(--danger-600)"
  },
  info: {
    bg: "var(--info-50)",
    border: "var(--info-200)",
    text: "var(--info-700)",
    dot: "var(--info-600)"
  },
  neutral: {
    bg: "var(--surface-sunken)",
    border: "var(--border-subtle)",
    text: "var(--text-muted)",
    dot: "var(--slate-400)"
  }
};

// Central status-label -> tone map (mirrors @signalthread/ui status tones).
const STATUS_TONE = {
  active: "success",
  approved: "success",
  ready: "success",
  completed: "success",
  draft: "warning",
  "in review": "warning",
  "needs setup": "warning",
  pending: "warning",
  rejected: "danger",
  blocked: "danger",
  canceled: "danger",
  error: "danger",
  scheduled: "info",
  "in progress": "info",
  unknown: "neutral"
};

/**
 * Status badge — tinted pill with a leading dot. Pass `tone`, or pass
 * `status` to resolve the tone automatically from the label.
 */
function Badge({
  children,
  tone,
  status,
  dot = true,
  style
}) {
  const resolved = tone || (status ? STATUS_TONE[String(status).toLowerCase()] : null) || "neutral";
  const t = TONES[resolved] || TONES.neutral;
  const label = children ?? status;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 22,
      padding: "0 10px",
      fontSize: "var(--text-xs)",
      fontWeight: "var(--weight-semibold)",
      lineHeight: 1,
      color: t.text,
      background: t.bg,
      border: `1px solid ${t.border}`,
      borderRadius: "var(--radius-pill)",
      whiteSpace: "nowrap",
      ...style
    }
  }, dot ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: t.dot,
      flexShrink: 0
    }
  }) : null, label);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Badge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/RoleBadge.jsx
try { (() => {
const ROLE_TONES = {
  elevated: {
    bg: "var(--violet-50)",
    border: "var(--violet-200)",
    text: "var(--violet-700)"
  },
  admin: {
    bg: "var(--info-50)",
    border: "var(--info-200)",
    text: "var(--info-700)"
  },
  member: {
    bg: "var(--surface-sunken)",
    border: "var(--border-subtle)",
    text: "var(--text-muted)"
  }
};

// Role key -> tone group.
const ROLE_MAP = {
  "super admin": "elevated",
  super_admin: "elevated",
  owner: "elevated",
  admin: "admin",
  "event editor": "admin",
  event_editor: "admin",
  member: "member",
  viewer: "member"
};
function pretty(role) {
  return String(role).replace(/_/g, " ").toUpperCase();
}

/**
 * Role badge — solid-tinted uppercase pill keyed by role.
 */
function RoleBadge({
  role,
  style
}) {
  const group = ROLE_MAP[String(role).toLowerCase()] || "member";
  const t = ROLE_TONES[group];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      height: 22,
      padding: "0 10px",
      fontSize: "var(--text-xs)",
      fontWeight: "var(--weight-semibold)",
      letterSpacing: "var(--tracking-wide)",
      lineHeight: 1,
      color: t.text,
      background: t.bg,
      border: `1px solid ${t.border}`,
      borderRadius: "var(--radius-pill)",
      whiteSpace: "nowrap",
      ...style
    }
  }, pretty(role));
}
Object.assign(__ds_scope, { RoleBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/RoleBadge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/StatCard.jsx
try { (() => {
const TINTS = {
  primary: {
    bg: "var(--primary-50)",
    fg: "var(--primary-700)"
  },
  success: {
    bg: "var(--success-50)",
    fg: "var(--success-700)"
  },
  warning: {
    bg: "var(--warning-50)",
    fg: "var(--warning-700)"
  },
  info: {
    bg: "var(--info-50)",
    fg: "var(--info-700)"
  },
  neutral: {
    bg: "var(--surface-sunken)",
    fg: "var(--text-muted)"
  }
};

/**
 * Compact metric card — eyebrow label, big value, sublabel, tinted icon chip.
 */
function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  tone = "primary",
  style
}) {
  const tint = TINTS[tone] || TINTS.primary;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      padding: "18px 20px",
      background: "var(--surface-card)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-card)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "var(--text-label)",
      fontWeight: "var(--weight-semibold)",
      letterSpacing: "var(--tracking-wide)",
      textTransform: "uppercase",
      color: "var(--text-muted)"
    }
  }, label), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "8px 0 0",
      fontSize: "var(--text-2xl)",
      lineHeight: 1,
      fontWeight: "var(--weight-bold)",
      color: "var(--text-strong)"
    }
  }, value), sublabel ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "8px 0 0",
      fontSize: "var(--text-sm)",
      color: "var(--text-muted)"
    }
  }, sublabel) : null), Icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 36,
      height: 36,
      borderRadius: "var(--radius-md)",
      background: tint.bg,
      color: tint.fg,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    size: 18,
    strokeWidth: 2
  })) : null);
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function Check({
  size = 14,
  strokeWidth = 3,
  color = "#fff"
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6 9 17l-5-5"
  }));
}

/**
 * Checkbox with label.
 */
function Checkbox({
  checked = false,
  onChange,
  label,
  disabled = false,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 20,
      height: 20,
      borderRadius: 6,
      border: `1.5px solid ${checked ? "var(--accent-primary)" : "var(--border-strong)"}`,
      background: checked ? "var(--accent-primary)" : "var(--surface-card)",
      transition: "background var(--dur-fast), border-color var(--dur-fast)"
    }
  }, checked ? /*#__PURE__*/React.createElement(Check, {
    size: 14,
    strokeWidth: 3,
    color: "#fff"
  }) : null), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-base)",
      color: "var(--text-body)"
    }
  }, label) : null);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/FormField.jsx
try { (() => {
/**
 * Field wrapper: label (+ required), control slot, helper or error text.
 * Mirrors @signalthread/ui FormField.
 */
function FormField({
  label,
  required = false,
  helper,
  error,
  htmlFor,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("label", {
    htmlFor: htmlFor,
    style: {
      fontSize: "var(--text-sm)",
      fontWeight: "var(--weight-medium)",
      color: "var(--text-body)"
    }
  }, label, required ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--danger-600)",
      marginLeft: 3
    }
  }, "*") : null) : null, children, error ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "var(--text-xs)",
      color: "var(--danger-600)"
    }
  }, error) : helper ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: "var(--text-xs)",
      color: "var(--text-muted)"
    }
  }, helper) : null);
}
Object.assign(__ds_scope, { FormField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/FormField.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Text input with optional leading icon, error and disabled states.
 */
function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  icon: Icon,
  invalid = false,
  disabled = false,
  size = "md",
  style,
  ...rest
}) {
  const [focused, setFocused] = React.useState(false);
  const height = size === "sm" ? 36 : 44;
  const borderColor = invalid ? "var(--danger-600)" : focused ? "var(--primary-600)" : "var(--border-subtle)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      width: "100%"
    }
  }, Icon ? /*#__PURE__*/React.createElement(Icon, {
    size: 18,
    strokeWidth: 2,
    style: {
      position: "absolute",
      left: 14,
      top: "50%",
      transform: "translateY(-50%)",
      color: "var(--text-subtle)",
      pointerEvents: "none"
    }
  }) : null, /*#__PURE__*/React.createElement("input", _extends({
    type: type,
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    disabled: disabled,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      width: "100%",
      height,
      padding: Icon ? "0 14px 0 42px" : "0 14px",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-base)",
      color: "var(--text-body)",
      background: disabled ? "var(--surface-muted)" : "var(--surface-card)",
      border: `1px solid ${borderColor}`,
      borderRadius: "var(--radius-md)",
      outline: "none",
      boxShadow: focused && !invalid ? "0 0 0 3px var(--ring)" : "none",
      transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)",
      cursor: disabled ? "not-allowed" : "text",
      ...style
    }
  }, rest)));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ChevronDown({
  size = 18,
  style
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: style
  }, /*#__PURE__*/React.createElement("path", {
    d: "m6 9 6 6 6-6"
  }));
}

/**
 * Native select styled to match SignalThread inputs.
 */
function Select({
  value,
  onChange,
  options = [],
  disabled = false,
  invalid = false,
  size = "md",
  style,
  ...rest
}) {
  const [focused, setFocused] = React.useState(false);
  const height = size === "sm" ? 36 : 44;
  const borderColor = invalid ? "var(--danger-600)" : focused ? "var(--primary-600)" : "var(--border-subtle)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      width: "100%"
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    value: value,
    onChange: onChange,
    disabled: disabled,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      width: "100%",
      height,
      padding: "0 40px 0 14px",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-base)",
      color: "var(--text-body)",
      background: disabled ? "var(--surface-muted)" : "var(--surface-card)",
      border: `1px solid ${borderColor}`,
      borderRadius: "var(--radius-md)",
      outline: "none",
      boxShadow: focused && !invalid ? "0 0 0 3px var(--ring)" : "none",
      appearance: "none",
      WebkitAppearance: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      ...style
    }
  }, rest), options.map(opt => {
    const o = typeof opt === "string" ? {
      value: opt,
      label: opt
    } : opt;
    return /*#__PURE__*/React.createElement("option", {
      key: o.value,
      value: o.value
    }, o.label);
  })), /*#__PURE__*/React.createElement(ChevronDown, {
    size: 18,
    strokeWidth: 2,
    style: {
      position: "absolute",
      right: 14,
      top: "50%",
      transform: "translateY(-50%)",
      color: "var(--text-subtle)",
      pointerEvents: "none"
    }
  }));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
/**
 * Toggle switch for binary settings.
 */
function Switch({
  checked = false,
  onChange,
  label,
  disabled = false,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      position: "relative",
      width: 40,
      height: 24,
      borderRadius: "var(--radius-pill)",
      background: checked ? "var(--accent-primary)" : "var(--slate-300)",
      transition: "background var(--dur-base) var(--ease-standard)",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 2,
      left: checked ? 18 : 2,
      width: 20,
      height: 20,
      borderRadius: "50%",
      background: "#fff",
      boxShadow: "var(--shadow-sm)",
      transition: "left var(--dur-base) var(--ease-standard)"
    }
  })), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-base)",
      color: "var(--text-body)"
    }
  }, label) : null);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Multi-line text input for notes and descriptions.
 */
function Textarea({
  value,
  onChange,
  placeholder,
  rows = 4,
  invalid = false,
  disabled = false,
  style,
  ...rest
}) {
  const [focused, setFocused] = React.useState(false);
  const borderColor = invalid ? "var(--danger-600)" : focused ? "var(--primary-600)" : "var(--border-subtle)";
  return /*#__PURE__*/React.createElement("textarea", _extends({
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    rows: rows,
    disabled: disabled,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      width: "100%",
      padding: "10px 14px",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-base)",
      lineHeight: "var(--leading-base)",
      color: "var(--text-body)",
      background: disabled ? "var(--surface-muted)" : "var(--surface-card)",
      border: `1px solid ${borderColor}`,
      borderRadius: "var(--radius-md)",
      outline: "none",
      resize: "vertical",
      boxShadow: focused && !invalid ? "0 0 0 3px var(--ring)" : "none",
      transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)",
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/layout/Card.jsx
try { (() => {
/**
 * Surface card — white, slate-200 border, 16px radius, whisper shadow.
 * The default container for panels and grouped content.
 */
function Card({
  children,
  padding = 20,
  interactive = false,
  style
}) {
  const [hovered, setHovered] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onMouseEnter: () => interactive && setHovered(true),
    onMouseLeave: () => interactive && setHovered(false),
    style: {
      background: "var(--surface-card)",
      border: `1px solid ${hovered ? "var(--border-strong)" : "var(--border-subtle)"}`,
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-card)",
      padding,
      transition: "border-color var(--dur-fast)",
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/Card.jsx", error: String((e && e.message) || e) }); }

// components/layout/PanelHeader.jsx
try { (() => {
/**
 * Reusable header for cards, dashboard panels, filter groups, and admin
 * sections. Keeps eyebrow, title, meta, description, and actions consistent.
 */
function PanelHeader({
  eyebrow,
  title,
  meta,
  description,
  action,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 16,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, eyebrow ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 4px",
      fontSize: "var(--text-label)",
      fontWeight: "var(--weight-semibold)",
      letterSpacing: "var(--tracking-wide)",
      textTransform: "uppercase",
      color: "var(--text-subtle)"
    }
  }, eyebrow) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 10,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: "var(--text-lg)",
      lineHeight: "var(--leading-lg)",
      fontWeight: "var(--weight-semibold)",
      color: "var(--text-heading)"
    }
  }, title), meta ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: "var(--text-xs)",
      color: "var(--text-subtle)"
    }
  }, meta) : null), description ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "6px 0 0",
      fontSize: "var(--text-sm)",
      lineHeight: "var(--leading-sm)",
      color: "var(--text-muted)",
      maxWidth: 620
    }
  }, description) : null), action ? /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0
    }
  }, action) : null);
}
Object.assign(__ds_scope, { PanelHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/PanelHeader.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SegmentedControl.jsx
try { (() => {
/**
 * Segmented control — compact mode/view switcher. Active option is a
 * white pill on a sunken track.
 */
function SegmentedControl({
  items = [],
  value,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 2,
      padding: 3,
      background: "var(--surface-sunken)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-md)",
      ...style
    }
  }, items.map(item => {
    const key = typeof item === "string" ? item : item.key;
    const label = typeof item === "string" ? item : item.label;
    const count = typeof item === "string" ? undefined : item.count;
    const active = key === value;
    return /*#__PURE__*/React.createElement("button", {
      key: key,
      type: "button",
      onClick: () => onChange && onChange(key),
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 30,
        padding: "0 12px",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
        fontWeight: "var(--weight-semibold)",
        color: active ? "var(--text-heading)" : "var(--text-muted)",
        background: active ? "var(--surface-card)" : "transparent",
        border: "none",
        borderRadius: "var(--radius-sm)",
        boxShadow: active ? "var(--shadow-xs)" : "none",
        cursor: "pointer",
        transition: "background var(--dur-fast), color var(--dur-fast)"
      }
    }, label, count != null ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: "var(--text-xs)",
        color: active ? "var(--text-subtle)" : "var(--text-subtle)"
      }
    }, count) : null);
  }));
}
Object.assign(__ds_scope, { SegmentedControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SegmentedControl.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
/**
 * Count tabs — button-style tabs with optional count pills.
 * Active tab fills with primary; counts ride in a contrast pill.
 */
function Tabs({
  items = [],
  value,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      ...style
    }
  }, items.map(item => {
    const key = typeof item === "string" ? item : item.key;
    const label = typeof item === "string" ? item : item.label;
    const count = typeof item === "string" ? undefined : item.count;
    const active = key === value;
    return /*#__PURE__*/React.createElement("button", {
      key: key,
      type: "button",
      onClick: () => onChange && onChange(key),
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 36,
        padding: "0 14px",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
        fontWeight: "var(--weight-semibold)",
        color: active ? "var(--text-on-primary)" : "var(--text-body)",
        background: active ? "var(--accent-primary)" : "var(--surface-card)",
        border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-subtle)"}`,
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        transition: "background var(--dur-fast), color var(--dur-fast)"
      }
    }, label, count != null ? /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 20,
        height: 18,
        padding: "0 6px",
        fontSize: "var(--text-xs)",
        fontWeight: "var(--weight-semibold)",
        borderRadius: "var(--radius-pill)",
        color: active ? "var(--text-on-primary)" : "var(--text-muted)",
        background: active ? "rgba(255,255,255,0.22)" : "var(--surface-sunken)"
      }
    }, count) : null);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/planner-dash/App.jsx
try { (() => {
// Simple dashboard + generic placeholder for un-built nav targets.
function DashboardScreen() {
  const {
    StatCard,
    Card,
    PanelHeader,
    Alert
  } = window.SignalThreadDesignSystem_204ca3;
  const {
    CalendarDays,
    Wallet,
    UsersRound
  } = window.STIcons;
  return /*#__PURE__*/React.createElement("section", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 32,
      lineHeight: "36px",
      fontWeight: 600,
      color: "var(--text-strong)"
    }
  }, "Dashboard"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "6px 0 0",
      fontSize: 15,
      color: "var(--text-muted)"
    }
  }, "Overview of events, budgets, and team activity.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "Active events",
    value: "6",
    sublabel: "2 starting this week",
    icon: CalendarDays
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Budget variance",
    value: "-3.1%",
    sublabel: "Under forecast",
    tone: "success",
    icon: Wallet
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Team",
    value: "42",
    sublabel: "Across 8 events",
    tone: "info",
    icon: UsersRound
  })), /*#__PURE__*/React.createElement(Card, {
    padding: 24
  }, /*#__PURE__*/React.createElement(PanelHeader, {
    eyebrow: "Activity",
    title: "Recent activity",
    description: "A consolidated feed of approvals, invites, and budget changes will appear here."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement(Alert, {
    tone: "info",
    title: "Audience import preview is ready for review."
  }))));
}
function PlaceholderScreen({
  label
}) {
  const {
    Card
  } = window.SignalThreadDesignSystem_204ca3;
  return /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: "0 0 20px",
      fontSize: 32,
      lineHeight: "36px",
      fontWeight: 600,
      color: "var(--text-strong)"
    }
  }, label), /*#__PURE__*/React.createElement(Card, {
    padding: 48,
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 15,
      color: "var(--text-muted)"
    }
  }, "This surface isn't part of the kit \u2014 it reuses the same shell, cards, and controls.")));
}
function App() {
  const [authed, setAuthed] = React.useState(Boolean(window.__ST_START_AUTHED));
  const [nav, setNav] = React.useState(window.__ST_START_NAV || "users");
  if (!authed) return /*#__PURE__*/React.createElement(window.LoginScreen, {
    onLogin: () => setAuthed(true)
  });
  let screen;
  if (nav === "dashboard") screen = /*#__PURE__*/React.createElement(DashboardScreen, null);else if (nav === "events") screen = /*#__PURE__*/React.createElement(window.EventsScreen, null);else if (nav === "users") screen = /*#__PURE__*/React.createElement(window.PlatformUsersScreen, null);else screen = /*#__PURE__*/React.createElement(PlaceholderScreen, {
    label: {
      timeline: "Timeline",
      budgets: "Budgets",
      matrix: "Matrix",
      docs: "Docs Hub",
      reports: "Reports",
      settings: "Settings"
    }[nav] || "Planner Dash"
  });
  return /*#__PURE__*/React.createElement(window.Shell, {
    active: nav,
    onNav: setNav
  }, screen);
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/planner-dash/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/planner-dash/EventsScreen.jsx
try { (() => {
// Events list — search, status filter, table, and a New Event modal.
const EVENT_ROWS = [{
  id: "1",
  name: "Atlas Annual Summit",
  start: "Mar 4, 2026",
  end: "Mar 6, 2026",
  status: "Active",
  deadlines: 8,
  forecast: 420000,
  actual: 388500
}, {
  id: "2",
  name: "Northstar Product Launch",
  start: "Apr 18, 2026",
  end: "Apr 18, 2026",
  status: "Active",
  deadlines: 5,
  forecast: 156000,
  actual: 162400
}, {
  id: "3",
  name: "Summit House Gala",
  start: "Feb 12, 2026",
  end: null,
  status: "Draft",
  deadlines: 2,
  forecast: 90000,
  actual: 0
}, {
  id: "4",
  name: "Q1 Partner Roadshow",
  start: "Jan 22, 2026",
  end: "Jan 30, 2026",
  status: "Completed",
  deadlines: 12,
  forecast: 305000,
  actual: 298750
}];
function money(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(cents);
}
function EventsScreen() {
  const {
    Button,
    Input,
    Select,
    DataTable,
    Badge
  } = window.SignalThreadDesignSystem_204ca3;
  const {
    Plus,
    Search,
    Filter,
    X
  } = window.STIcons;
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("All");
  const [modal, setModal] = React.useState(false);
  const rows = EVENT_ROWS.filter(r => r.name.toLowerCase().includes(query.toLowerCase()) && (status === "All" || r.status === status));
  const columns = [{
    key: "name",
    header: "Event name",
    render: r => /*#__PURE__*/React.createElement("a", {
      href: "#",
      onClick: e => e.preventDefault(),
      style: {
        fontWeight: 600,
        color: "var(--text-link)"
      }
    }, r.name)
  }, {
    key: "start",
    header: "Start"
  }, {
    key: "end",
    header: "End",
    render: r => r.end || "—"
  }, {
    key: "status",
    header: "Status",
    render: r => /*#__PURE__*/React.createElement(Badge, {
      status: r.status
    }, r.status)
  }, {
    key: "deadlines",
    header: "Deadlines",
    align: "right"
  }, {
    key: "forecast",
    header: "Forecast",
    align: "right",
    render: r => money(r.forecast)
  }, {
    key: "actual",
    header: "Actual",
    align: "right",
    render: r => money(r.actual)
  }, {
    key: "variance",
    header: "Variance",
    align: "right",
    render: r => {
      const v = r.actual - r.forecast;
      const good = v <= 0;
      return /*#__PURE__*/React.createElement("span", {
        style: {
          fontWeight: 600,
          color: good ? "var(--success-700)" : "var(--danger-700)"
        }
      }, money(v));
    }
  }];
  return /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 32,
      lineHeight: "36px",
      fontWeight: 600,
      color: "var(--text-strong)"
    }
  }, "Events"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "6px 0 0",
      fontSize: 18,
      color: "var(--text-muted)"
    }
  }, "Acme Events Inc.")), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    icon: Plus,
    onClick: () => setModal(true)
  }, "New Event")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 14,
      marginTop: 24,
      marginBottom: 20,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 280,
      maxWidth: 560
    }
  }, /*#__PURE__*/React.createElement(Input, {
    icon: Search,
    placeholder: "Search events\u2026",
    value: query,
    onChange: e => setQuery(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      height: 44,
      padding: "0 12px 0 14px",
      background: "var(--surface-card)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-md)"
    }
  }, /*#__PURE__*/React.createElement(Filter, {
    size: 18,
    style: {
      color: "var(--text-muted)"
    }
  }), /*#__PURE__*/React.createElement("select", {
    value: status,
    onChange: e => setStatus(e.target.value),
    style: {
      border: "none",
      background: "transparent",
      fontSize: 14,
      color: "var(--text-body)",
      outline: "none",
      cursor: "pointer",
      fontFamily: "var(--font-sans)"
    }
  }, ["All", "Active", "Draft", "Completed"].map(s => /*#__PURE__*/React.createElement("option", {
    key: s
  }, s))))), /*#__PURE__*/React.createElement(DataTable, {
    columns: columns,
    rows: rows,
    state: rows.length ? "ready" : "empty",
    emptyTitle: "No events found",
    emptyHint: "Try a different search or status filter.",
    emptyAction: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm",
      onClick: () => {
        setQuery("");
        setStatus("All");
      }
    }, "Clear filters")
  }), modal && /*#__PURE__*/React.createElement("div", {
    onClick: () => setModal(false),
    style: {
      position: "fixed",
      inset: 0,
      zIndex: 50,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(2,6,23,0.45)",
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: "100%",
      maxWidth: 560,
      background: "var(--surface-card)",
      borderRadius: "var(--radius-xl)",
      boxShadow: "var(--shadow-modal)",
      padding: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 20,
      fontWeight: 600,
      color: "var(--text-strong)"
    }
  }, "New Event"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setModal(false),
    style: {
      width: 32,
      height: 32,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      border: "none",
      background: "transparent",
      borderRadius: "var(--radius-sm)",
      cursor: "pointer",
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement(X, {
    size: 18
  }))), /*#__PURE__*/React.createElement(NewEventForm, {
    onClose: () => setModal(false)
  }))));
}
function NewEventForm({
  onClose
}) {
  const {
    Input,
    Select,
    FormField,
    Button
  } = window.SignalThreadDesignSystem_204ca3;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(FormField, {
    label: "Event name",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "Atlas Annual Summit"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(FormField, {
    label: "Start date",
    required: true
  }, /*#__PURE__*/React.createElement(Input, {
    type: "date"
  })), /*#__PURE__*/React.createElement(FormField, {
    label: "End date"
  }, /*#__PURE__*/React.createElement(Input, {
    type: "date"
  }))), /*#__PURE__*/React.createElement(FormField, {
    label: "Status"
  }, /*#__PURE__*/React.createElement(Select, {
    options: ["ACTIVE", "DRAFT", "COMPLETED", "CANCELED"]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    onClick: onClose
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: onClose
  }, "Create Event")));
}
window.EventsScreen = EventsScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/planner-dash/EventsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/planner-dash/LoginScreen.jsx
try { (() => {
// Login — branded magic-link / OTP entry (mirrors the real OTP login flow).
function LoginScreen({
  onLogin
}) {
  const {
    Input,
    FormField,
    Button
  } = window.SignalThreadDesignSystem_204ca3;
  const {
    Mail
  } = window.STIcons;
  const [step, setStep] = React.useState("email");
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--surface-canvas)",
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      maxWidth: 400
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "center",
      marginBottom: 28
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/signalthread-logo.png",
    alt: "SignalThread",
    style: {
      height: 38
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--surface-card)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-md)",
      padding: 28
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: "0 0 4px",
      fontSize: 22,
      fontWeight: 600,
      color: "var(--text-strong)"
    }
  }, step === "email" ? "Sign in" : "Enter your code"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 20px",
      fontSize: 14,
      color: "var(--text-muted)"
    }
  }, step === "email" ? "We'll email you a 6-digit sign-in code." : `Sent to ${email || "your inbox"}.`), step === "email" ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(FormField, {
    label: "Email",
    htmlFor: "login-email"
  }, /*#__PURE__*/React.createElement(Input, {
    id: "login-email",
    icon: Mail,
    type: "email",
    placeholder: "you@company.com",
    value: email,
    onChange: e => setEmail(e.target.value)
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: () => setStep("code"),
    style: {
      width: "100%"
    }
  }, "Send code")) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(FormField, {
    label: "6-digit code",
    htmlFor: "login-code"
  }, /*#__PURE__*/React.createElement(Input, {
    id: "login-code",
    placeholder: "123456",
    value: code,
    onChange: e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6)),
    style: {
      letterSpacing: "0.3em",
      fontFamily: "var(--font-mono)"
    }
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: onLogin,
    style: {
      width: "100%"
    }
  }, "Verify & continue"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setStep("email"),
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 500,
      color: "var(--text-muted)",
      textDecoration: "underline"
    }
  }, "Use a different email")))));
}
window.LoginScreen = LoginScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/planner-dash/LoginScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/planner-dash/PlatformUsersScreen.jsx
try { (() => {
// Platform Users — SUPER_ADMIN invite/provisioning + admin surface reference.
const ACCOUNT_ROWS = [{
  id: "1",
  name: "Atlas Events",
  slug: "atlas-events",
  admin: "alex@atlas.example",
  role: "OWNER",
  status: "Active",
  users: 42,
  events: 8
}, {
  id: "2",
  name: "Northstar Labs",
  slug: "northstar-labs",
  admin: "morgan@northstar.example",
  role: "ADMIN",
  status: "Active",
  users: 18,
  events: 4
}, {
  id: "3",
  name: "Summit House",
  slug: "summit-house",
  admin: "No primary admin",
  role: "VIEWER",
  status: "Needs setup",
  users: 7,
  events: 2
}];
function PlatformUsersScreen() {
  const {
    Button,
    Input,
    Select,
    FormField,
    Card,
    PanelHeader,
    Alert,
    StatCard,
    Tabs,
    DataTable,
    Badge,
    RoleBadge
  } = window.SignalThreadDesignSystem_204ca3;
  const {
    UserPlus,
    Mail,
    UsersRound,
    Search
  } = window.STIcons;
  const [tab, setTab] = React.useState("users");
  const [invited, setInvited] = React.useState(true);
  const columns = [{
    key: "account",
    header: "Account",
    render: r => /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 600,
        color: "var(--text-strong)"
      }
    }, r.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "var(--text-subtle)"
      }
    }, r.slug))
  }, {
    key: "admin",
    header: "Primary admin",
    render: r => /*#__PURE__*/React.createElement("span", {
      style: {
        color: r.admin.includes("No") ? "var(--text-subtle)" : "var(--text-body)"
      }
    }, r.admin)
  }, {
    key: "role",
    header: "Role",
    render: r => /*#__PURE__*/React.createElement(RoleBadge, {
      role: r.role
    })
  }, {
    key: "status",
    header: "Status",
    render: r => /*#__PURE__*/React.createElement(Badge, {
      status: r.status
    }, r.status)
  }, {
    key: "users",
    header: "Users",
    align: "right"
  }, {
    key: "events",
    header: "Events",
    align: "right"
  }];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 28
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: 32,
      lineHeight: "36px",
      fontWeight: 600,
      color: "var(--text-strong)"
    }
  }, "Platform Users"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "6px 0 0",
      fontSize: 15,
      color: "var(--text-muted)"
    }
  }, "SUPER_ADMIN-only user invite and provisioning controls.")), /*#__PURE__*/React.createElement(Card, {
    padding: 24
  }, /*#__PURE__*/React.createElement(PanelHeader, {
    eyebrow: "PANEL",
    title: "Invite and provision user",
    meta: "Updated today",
    description: "Sends an invite email, upserts the app user, and ensures org + event membership in one step."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 18,
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement(FormField, {
    label: "Email",
    required: true,
    helper: "Used for invite and sign-in delivery."
  }, /*#__PURE__*/React.createElement(Input, {
    icon: Mail,
    defaultValue: "planner@example.com"
  })), /*#__PURE__*/React.createElement(FormField, {
    label: "Organization",
    required: true
  }, /*#__PURE__*/React.createElement(Select, {
    options: ["Atlas Events (org_atlas)", "Northstar Labs (org_north)", "Summit House (org_summit)"]
  })), /*#__PURE__*/React.createElement(FormField, {
    label: "Role"
  }, /*#__PURE__*/React.createElement(Select, {
    options: ["MEMBER", "ADMIN", "OWNER", "VIEWER", "EVENT EDITOR"]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-end"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    icon: UserPlus,
    onClick: () => setInvited(true)
  }, "Invite user"))), invited && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement(Alert, {
    tone: "success",
    title: "Invite sent"
  }, "Provisioned org membership + 12 event memberships for planner@example.com."))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 4px",
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: ".05em",
      textTransform: "uppercase",
      color: "var(--text-subtle)"
    }
  }, "Product components"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 16,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 24,
      fontWeight: 600,
      color: "var(--text-heading)"
    }
  }, "Admin surface reference"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "6px 0 0",
      fontSize: 14,
      color: "var(--text-muted)",
      maxWidth: 560
    }
  }, "The same shell, card, table, badge, and control language used by the real Users / Admin page.")), /*#__PURE__*/React.createElement(Tabs, {
    items: [{
      key: "overview",
      label: "Overview",
      count: 12
    }, {
      key: "users",
      label: "Users",
      count: 42
    }, {
      key: "events",
      label: "Events",
      count: 8
    }],
    value: tab,
    onChange: setTab
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 16,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "Users",
    value: "1,248",
    sublabel: "Provisioned app users",
    icon: UsersRound
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Invites",
    value: "36",
    sublabel: "Created this month",
    tone: "info",
    icon: UserPlus
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "Review",
    value: "5",
    sublabel: "Need platform attention",
    tone: "warning",
    icon: UsersRound
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 14,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Input, {
    icon: Search,
    placeholder: "Search accounts\u2026"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 180
    }
  }, /*#__PURE__*/React.createElement(Select, {
    options: ["All roles", "Owners", "Admins", "Members"]
  }))), /*#__PURE__*/React.createElement(DataTable, {
    columns: columns,
    rows: ACCOUNT_ROWS
  })));
}
window.PlatformUsersScreen = PlatformUsersScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/planner-dash/PlatformUsersScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/planner-dash/Shell.jsx
try { (() => {
// Planner Dash app shell — fixed sidebar + top bar.
const NAV = [{
  key: "dashboard",
  label: "Dashboard",
  icon: "LayoutGrid"
}, {
  key: "events",
  label: "Events",
  icon: "CalendarDays"
}, {
  key: "timeline",
  label: "Timeline",
  icon: "ListTree"
}, {
  key: "budgets",
  label: "Budgets",
  icon: "Wallet"
}, {
  key: "matrix",
  label: "Matrix",
  icon: "Table2"
}, {
  key: "users",
  label: "Platform Users",
  icon: "UsersRound"
}, {
  key: "docs",
  label: "Docs Hub",
  icon: "FolderOpenDot"
}, {
  key: "reports",
  label: "Reports",
  icon: "FileText"
}, {
  key: "settings",
  label: "Settings",
  icon: "Settings"
}];
function NavItem({
  item,
  active,
  onClick
}) {
  const [hover, setHover] = React.useState(false);
  const Icon = window.STIcons[item.icon];
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      width: "100%",
      height: 48,
      padding: "0 16px",
      border: "none",
      cursor: "pointer",
      borderRadius: "var(--radius-md)",
      textAlign: "left",
      backgroundColor: active ? "var(--accent-primary)" : hover ? "var(--surface-sunken)" : "transparent",
      color: active ? "#fff" : "var(--text-body)",
      transition: "background-color var(--dur-fast), color var(--dur-fast)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    size: 20,
    strokeWidth: 2
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 600
    }
  }, item.label));
}
function Shell({
  active,
  onNav,
  orgName = "Acme Events Inc",
  children
}) {
  const {
    Bell
  } = window.STIcons;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: "100%",
      background: "var(--surface-canvas)",
      color: "var(--text-body)"
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      position: "fixed",
      insetBlock: 0,
      left: 0,
      width: 280,
      borderRight: "1px solid var(--border-subtle)",
      background: "var(--surface-canvas)",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 80,
      display: "flex",
      alignItems: "center",
      padding: "0 24px",
      borderBottom: "1px solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/signalthread-logo.png",
    alt: "SignalThread",
    style: {
      height: 30
    }
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      padding: "18px 16px",
      overflowY: "auto"
    }
  }, NAV.map(item => /*#__PURE__*/React.createElement(NavItem, {
    key: item.key,
    item: item,
    active: active === item.key,
    onClick: () => onNav(item.key)
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 280,
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      height: 80,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 28px",
      borderBottom: "1px solid var(--border-subtle)",
      background: "var(--surface-canvas)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 28,
      fontWeight: 600,
      color: "var(--text-heading)"
    }
  }, orgName), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "relative",
      color: "var(--text-muted)",
      display: "inline-flex"
    }
  }, /*#__PURE__*/React.createElement(Bell, {
    size: 20
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: -3,
      right: -3,
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: "var(--danger-600)"
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: ".05em",
      color: "var(--violet-700)",
      background: "var(--violet-50)",
      border: "1px solid var(--violet-200)",
      padding: "5px 10px",
      borderRadius: "var(--radius-pill)"
    }
  }, "SUPER ADMIN"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 36,
      height: 36,
      borderRadius: "var(--radius-md)",
      background: "var(--brand-navy)",
      color: "#fff",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 13,
      fontWeight: 700
    }
  }, "KA"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      fontSize: 14,
      color: "var(--text-muted)"
    }
  }, "Log out"))), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      padding: 28
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1100
    }
  }, children))));
}
window.Shell = Shell;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/planner-dash/Shell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/planner-dash/icons.jsx
try { (() => {
// Shared inline icons (lucide geometry) for the Planner Dash UI kit.
// Each is a React component taking {size, strokeWidth}.
const mk = paths => function Icon({
  size = 20,
  strokeWidth = 2,
  style
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: style
  }, paths);
};
const STIcons = {
  LayoutGrid: mk(/*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("rect", {
    width: "7",
    height: "7",
    x: "3",
    y: "3",
    rx: "1"
  }), /*#__PURE__*/React.createElement("rect", {
    width: "7",
    height: "7",
    x: "14",
    y: "3",
    rx: "1"
  }), /*#__PURE__*/React.createElement("rect", {
    width: "7",
    height: "7",
    x: "14",
    y: "14",
    rx: "1"
  }), /*#__PURE__*/React.createElement("rect", {
    width: "7",
    height: "7",
    x: "3",
    y: "14",
    rx: "1"
  }))),
  CalendarDays: mk(/*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
    d: "M8 2v4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 2v4"
  }), /*#__PURE__*/React.createElement("rect", {
    width: "18",
    height: "18",
    x: "3",
    y: "4",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 10h18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 14h.01"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 14h.01"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 14h.01"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 18h.01"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 18h.01"
  }))),
  ListTree: mk(/*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
    d: "M21 12h-8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M21 6H8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M21 18h-8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 6v4c0 1.1.9 2 2 2h3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 10v6c0 1.1.9 2 2 2h3"
  }))),
  Wallet: mk(/*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
    d: "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"
  }))),
  Table2: mk(/*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
    d: "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"
  }))),
  UsersRound: mk(/*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
    d: "M18 21a8 8 0 0 0-16 0"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "10",
    cy: "8",
    r: "5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M22 20c0-3.37-2-6.5-3-8a5 5 0 0 0-.45-8.3"
  }))),
  FolderOpenDot: mk(/*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
    d: "M6 14v8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M2 13a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M2 13v6a2 2 0 0 0 2 2h2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M20 13v6a2 2 0 0 1-2 2h-2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m4 11 .5-3.5a2 2 0 0 1 2-1.5h2.4a2 2 0 0 1 1.6.8l.6.8a2 2 0 0 0 1.6.8H18a2 2 0 0 1 2 1.7l.3 2.4"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "17",
    r: "1"
  }))),
  FileText: mk(/*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
    d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14 2v4a2 2 0 0 0 2 2h4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 9H8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 13H8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 17H8"
  }))),
  Settings: mk(/*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
    d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  }))),
  Plus: mk(/*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
    d: "M5 12h14"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 5v14"
  }))),
  Search: mk(/*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "8"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m21 21-4.3-4.3"
  }))),
  Filter: mk(/*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("polygon", {
    points: "22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"
  }))),
  X: mk(/*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m6 6 12 12"
  }))),
  Bell: mk(/*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
    d: "M10.268 21a2 2 0 0 0 3.464 0"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"
  }))),
  UserPlus: mk(/*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
    d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "7",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M19 8v6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M22 11h-6"
  }))),
  Mail: mk(/*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("rect", {
    width: "20",
    height: "16",
    x: "2",
    y: "4",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"
  }))),
  CheckCircle: mk(/*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
    d: "M21.801 10A10 10 0 1 1 17 3.335"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m9 11 3 3L22 4"
  })))
};
window.STIcons = STIcons;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/planner-dash/icons.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.DataTable = __ds_scope.DataTable;

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.RoleBadge = __ds_scope.RoleBadge;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.FormField = __ds_scope.FormField;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.PanelHeader = __ds_scope.PanelHeader;

__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
