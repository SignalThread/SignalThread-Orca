// Events list — search, status filter, table, and a New Event modal.
const EVENT_ROWS = [
  { id: "1", name: "Atlas Annual Summit", start: "Mar 4, 2026", end: "Mar 6, 2026", status: "Active", deadlines: 8, forecast: 420000, actual: 388500 },
  { id: "2", name: "Northstar Product Launch", start: "Apr 18, 2026", end: "Apr 18, 2026", status: "Active", deadlines: 5, forecast: 156000, actual: 162400 },
  { id: "3", name: "Summit House Gala", start: "Feb 12, 2026", end: null, status: "Draft", deadlines: 2, forecast: 90000, actual: 0 },
  { id: "4", name: "Q1 Partner Roadshow", start: "Jan 22, 2026", end: "Jan 30, 2026", status: "Completed", deadlines: 12, forecast: 305000, actual: 298750 },
];

function money(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents);
}

function EventsScreen() {
  const { Button, Input, Select, DataTable, Badge } = window.SignalThreadDesignSystem_204ca3;
  const { Plus, Search, Filter, X } = window.STIcons;
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("All");
  const [modal, setModal] = React.useState(false);

  const rows = EVENT_ROWS.filter((r) =>
    r.name.toLowerCase().includes(query.toLowerCase()) && (status === "All" || r.status === status));

  const columns = [
    { key: "name", header: "Event name", render: (r) => (
        <a href="#" onClick={(e) => e.preventDefault()} style={{ fontWeight: 600, color: "var(--text-link)" }}>{r.name}</a>) },
    { key: "start", header: "Start" },
    { key: "end", header: "End", render: (r) => r.end || "—" },
    { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.status}</Badge> },
    { key: "deadlines", header: "Deadlines", align: "right" },
    { key: "forecast", header: "Forecast", align: "right", render: (r) => money(r.forecast) },
    { key: "actual", header: "Actual", align: "right", render: (r) => money(r.actual) },
    { key: "variance", header: "Variance", align: "right", render: (r) => {
        const v = r.actual - r.forecast;
        const good = v <= 0;
        return <span style={{ fontWeight: 600, color: good ? "var(--success-700)" : "var(--danger-700)" }}>{money(v)}</span>;
      } },
  ];

  return (
    <section>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 32, lineHeight: "36px", fontWeight: 600, color: "var(--text-strong)" }}>Events</h2>
          <p style={{ margin: "6px 0 0", fontSize: 18, color: "var(--text-muted)" }}>Acme Events Inc.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setModal(true)}>New Event</Button>
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 24, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 280, maxWidth: 560 }}>
          <Input icon={Search} placeholder="Search events…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 44, padding: "0 12px 0 14px", background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
          <Filter size={18} style={{ color: "var(--text-muted)" }} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ border: "none", background: "transparent", fontSize: 14, color: "var(--text-body)", outline: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
            {["All", "Active", "Draft", "Completed"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <DataTable columns={columns} rows={rows} state={rows.length ? "ready" : "empty"}
        emptyTitle="No events found" emptyHint="Try a different search or status filter."
        emptyAction={<Button variant="secondary" size="sm" onClick={() => { setQuery(""); setStatus("All"); }}>Clear filters</Button>} />

      {modal && (
        <div onClick={() => setModal(false)} style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,6,23,0.45)", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: "var(--surface-card)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-modal)", padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--text-strong)" }}>New Event</h3>
              <button type="button" onClick={() => setModal(false)} style={{ width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--text-muted)" }}>
                <X size={18} />
              </button>
            </div>
            <NewEventForm onClose={() => setModal(false)} />
          </div>
        </div>
      )}
    </section>
  );
}

function NewEventForm({ onClose }) {
  const { Input, Select, FormField, Button } = window.SignalThreadDesignSystem_204ca3;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <FormField label="Event name" required><Input placeholder="Atlas Annual Summit" /></FormField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <FormField label="Start date" required><Input type="date" /></FormField>
        <FormField label="End date"><Input type="date" /></FormField>
      </div>
      <FormField label="Status"><Select options={["ACTIVE", "DRAFT", "COMPLETED", "CANCELED"]} /></FormField>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={onClose}>Create Event</Button>
      </div>
    </div>
  );
}
window.EventsScreen = EventsScreen;
