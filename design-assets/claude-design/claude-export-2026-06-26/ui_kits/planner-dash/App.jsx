// Simple dashboard + generic placeholder for un-built nav targets.
function DashboardScreen() {
  const { StatCard, Card, PanelHeader, Alert } = window.SignalThreadDesignSystem_204ca3;
  const { CalendarDays, Wallet, UsersRound } = window.STIcons;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 32, lineHeight: "36px", fontWeight: 600, color: "var(--text-strong)" }}>Dashboard</h2>
        <p style={{ margin: "6px 0 0", fontSize: 15, color: "var(--text-muted)" }}>Overview of events, budgets, and team activity.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        <StatCard label="Active events" value="6" sublabel="2 starting this week" icon={CalendarDays} />
        <StatCard label="Budget variance" value="-3.1%" sublabel="Under forecast" tone="success" icon={Wallet} />
        <StatCard label="Team" value="42" sublabel="Across 8 events" tone="info" icon={UsersRound} />
      </div>
      <Card padding={24}>
        <PanelHeader eyebrow="Activity" title="Recent activity"
          description="A consolidated feed of approvals, invites, and budget changes will appear here." />
        <div style={{ marginTop: 18 }}>
          <Alert tone="info" title="Audience import preview is ready for review." />
        </div>
      </Card>
    </section>
  );
}

function PlaceholderScreen({ label }) {
  const { Card } = window.SignalThreadDesignSystem_204ca3;
  return (
    <section>
      <h2 style={{ margin: "0 0 20px", fontSize: 32, lineHeight: "36px", fontWeight: 600, color: "var(--text-strong)" }}>{label}</h2>
      <Card padding={48} style={{ textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 15, color: "var(--text-muted)" }}>This surface isn't part of the kit — it reuses the same shell, cards, and controls.</p>
      </Card>
    </section>
  );
}

function App() {
  const [authed, setAuthed] = React.useState(Boolean(window.__ST_START_AUTHED));
  const [nav, setNav] = React.useState(window.__ST_START_NAV || "users");

  if (!authed) return <window.LoginScreen onLogin={() => setAuthed(true)} />;

  let screen;
  if (nav === "dashboard") screen = <DashboardScreen />;
  else if (nav === "events") screen = <window.EventsScreen />;
  else if (nav === "users") screen = <window.PlatformUsersScreen />;
  else screen = <PlaceholderScreen label={({ timeline: "Timeline", budgets: "Budgets", matrix: "Matrix", docs: "Docs Hub", reports: "Reports", settings: "Settings" })[nav] || "Planner Dash"} />;

  return (
    <window.Shell active={nav} onNav={setNav}>
      {screen}
    </window.Shell>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
