// Planner Dash app shell — fixed sidebar + top bar.
const NAV = [
  { key: "dashboard", label: "Dashboard", icon: "LayoutGrid" },
  { key: "events", label: "Events", icon: "CalendarDays" },
  { key: "timeline", label: "Timeline", icon: "ListTree" },
  { key: "budgets", label: "Budgets", icon: "Wallet" },
  { key: "matrix", label: "Matrix", icon: "Table2" },
  { key: "users", label: "Platform Users", icon: "UsersRound" },
  { key: "docs", label: "Docs Hub", icon: "FolderOpenDot" },
  { key: "reports", label: "Reports", icon: "FileText" },
  { key: "settings", label: "Settings", icon: "Settings" },
];

function NavItem({ item, active, onClick }) {
  const [hover, setHover] = React.useState(false);
  const Icon = window.STIcons[item.icon];
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        height: 48, padding: "0 16px", border: "none", cursor: "pointer",
        borderRadius: "var(--radius-md)", textAlign: "left",
        backgroundColor: active ? "var(--accent-primary)" : hover ? "var(--surface-sunken)" : "transparent",
        color: active ? "#fff" : "var(--text-body)",
        transition: "background-color var(--dur-fast), color var(--dur-fast)",
      }}
    >
      <Icon size={20} strokeWidth={2} />
      <span style={{ fontSize: 14, fontWeight: 600 }}>{item.label}</span>
    </button>
  );
}

function Shell({ active, onNav, orgName = "Acme Events Inc", children }) {
  const { Bell } = window.STIcons;
  return (
    <div style={{ minHeight: "100%", background: "var(--surface-canvas)", color: "var(--text-body)" }}>
      <aside style={{
        position: "fixed", insetBlock: 0, left: 0, width: 280,
        borderRight: "1px solid var(--border-subtle)", background: "var(--surface-canvas)",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ height: 80, display: "flex", alignItems: "center", padding: "0 24px", borderBottom: "1px solid var(--border-subtle)" }}>
          <img src="../../assets/signalthread-logo.png" alt="SignalThread" style={{ height: 30 }} />
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 6, padding: "18px 16px", overflowY: "auto" }}>
          {NAV.map((item) => (
            <NavItem key={item.key} item={item} active={active === item.key} onClick={() => onNav(item.key)} />
          ))}
        </nav>
      </aside>

      <div style={{ marginLeft: 280, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <header style={{
          height: 80, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 28px", borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-canvas)",
        }}>
          <div style={{ fontSize: 28, fontWeight: 600, color: "var(--text-heading)" }}>{orgName}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <span style={{ position: "relative", color: "var(--text-muted)", display: "inline-flex" }}>
              <Bell size={20} />
              <span style={{ position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: "50%", background: "var(--danger-600)" }} />
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: ".05em", color: "var(--violet-700)",
              background: "var(--violet-50)", border: "1px solid var(--violet-200)",
              padding: "5px 10px", borderRadius: "var(--radius-pill)",
            }}>SUPER ADMIN</span>
            <span style={{
              width: 36, height: 36, borderRadius: "var(--radius-md)", background: "var(--brand-navy)",
              color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700,
            }}>KA</span>
            <button type="button" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--text-muted)" }}>Log out</button>
          </div>
        </header>
        <main style={{ flex: 1, padding: 28 }}>
          <div style={{ maxWidth: 1100 }}>{children}</div>
        </main>
      </div>
    </div>
  );
}

window.Shell = Shell;
