// Platform Users — SUPER_ADMIN invite/provisioning + admin surface reference.
const ACCOUNT_ROWS = [
  { id: "1", name: "Atlas Events", slug: "atlas-events", admin: "alex@atlas.example", role: "OWNER", status: "Active", users: 42, events: 8 },
  { id: "2", name: "Northstar Labs", slug: "northstar-labs", admin: "morgan@northstar.example", role: "ADMIN", status: "Active", users: 18, events: 4 },
  { id: "3", name: "Summit House", slug: "summit-house", admin: "No primary admin", role: "VIEWER", status: "Needs setup", users: 7, events: 2 },
];

function PlatformUsersScreen() {
  const { Button, Input, Select, FormField, Card, PanelHeader, Alert, StatCard, Tabs, DataTable, Badge, RoleBadge } = window.SignalThreadDesignSystem_204ca3;
  const { UserPlus, Mail, UsersRound, Search } = window.STIcons;
  const [tab, setTab] = React.useState("users");
  const [invited, setInvited] = React.useState(true);

  const columns = [
    { key: "account", header: "Account", render: (r) => (
        <div>
          <div style={{ fontWeight: 600, color: "var(--text-strong)" }}>{r.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>{r.slug}</div>
        </div>) },
    { key: "admin", header: "Primary admin", render: (r) => <span style={{ color: r.admin.includes("No") ? "var(--text-subtle)" : "var(--text-body)" }}>{r.admin}</span> },
    { key: "role", header: "Role", render: (r) => <RoleBadge role={r.role} /> },
    { key: "status", header: "Status", render: (r) => <Badge status={r.status}>{r.status}</Badge> },
    { key: "users", header: "Users", align: "right" },
    { key: "events", header: "Events", align: "right" },
  ];

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 32, lineHeight: "36px", fontWeight: 600, color: "var(--text-strong)" }}>Platform Users</h2>
        <p style={{ margin: "6px 0 0", fontSize: 15, color: "var(--text-muted)" }}>SUPER_ADMIN-only user invite and provisioning controls.</p>
      </div>

      <Card padding={24}>
        <PanelHeader eyebrow="PANEL" title="Invite and provision user" meta="Updated today"
          description="Sends an invite email, upserts the app user, and ensures org + event membership in one step." />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 20 }}>
          <FormField label="Email" required helper="Used for invite and sign-in delivery.">
            <Input icon={Mail} defaultValue="planner@example.com" />
          </FormField>
          <FormField label="Organization" required>
            <Select options={["Atlas Events (org_atlas)", "Northstar Labs (org_north)", "Summit House (org_summit)"]} />
          </FormField>
          <FormField label="Role">
            <Select options={["MEMBER", "ADMIN", "OWNER", "VIEWER", "EVENT EDITOR"]} />
          </FormField>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <Button variant="primary" icon={UserPlus} onClick={() => setInvited(true)}>Invite user</Button>
          </div>
        </div>
        {invited && (
          <div style={{ marginTop: 18 }}>
            <Alert tone="success" title="Invite sent">
              Provisioned org membership + 12 event memberships for planner@example.com.
            </Alert>
          </div>
        )}
      </Card>

      <div>
        <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-subtle)" }}>Product components</p>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: "var(--text-heading)" }}>Admin surface reference</h3>
            <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--text-muted)", maxWidth: 560 }}>The same shell, card, table, badge, and control language used by the real Users / Admin page.</p>
          </div>
          <Tabs items={[{ key: "overview", label: "Overview", count: 12 }, { key: "users", label: "Users", count: 42 }, { key: "events", label: "Events", count: 8 }]} value={tab} onChange={setTab} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 18 }}>
          <StatCard label="Users" value="1,248" sublabel="Provisioned app users" icon={UsersRound} />
          <StatCard label="Invites" value="36" sublabel="Created this month" tone="info" icon={UserPlus} />
          <StatCard label="Review" value="5" sublabel="Need platform attention" tone="warning" icon={UsersRound} />
        </div>

        <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
          <div style={{ flex: 1 }}><Input icon={Search} placeholder="Search accounts…" /></div>
          <div style={{ width: 180 }}><Select options={["All roles", "Owners", "Admins", "Members"]} /></div>
        </div>

        <DataTable columns={columns} rows={ACCOUNT_ROWS} />
      </div>
    </section>
  );
}
window.PlatformUsersScreen = PlatformUsersScreen;
