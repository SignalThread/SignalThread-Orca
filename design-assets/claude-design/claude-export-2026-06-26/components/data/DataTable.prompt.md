The operational table used across admin and product surfaces. Declares columns and renders rows, with empty / loading / error states that keep the table frame.

```jsx
const columns = [
  { key: "account", header: "Account", render: r => (
      <div><div style={{fontWeight:600,color:"var(--text-strong)"}}>{r.name}</div>
      <div style={{fontSize:"var(--text-xs)",color:"var(--text-subtle)"}}>{r.slug}</div></div>) },
  { key: "role", header: "Role", render: r => <RoleBadge role={r.role} /> },
  { key: "status", header: "Status", render: r => <Badge status={r.status} /> },
  { key: "users", header: "Users", align: "right" },
];

<DataTable columns={columns} rows={rows} />
<DataTable columns={columns} state="empty" emptyTitle="No users found"
  emptyHint="Try clearing filters or inviting a user."
  emptyAction={<Button variant="secondary" size="sm">Clear filters</Button>} />
<DataTable columns={columns} state="loading" />
<DataTable columns={columns} state="error" errorAction={<Button variant="secondary" size="sm">Retry</Button>} />
```

Headers are 10px uppercase slate. Compose cells with `Badge`, `RoleBadge`, and links — don't restyle rows ad hoc.
