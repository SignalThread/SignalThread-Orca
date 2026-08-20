Feedback primitives — status communication across SignalThread surfaces.

```jsx
// Status badges resolve tone from the label automatically
<Badge status="Active" />      <Badge status="Needs setup" />
<Badge status="Rejected" />    <Badge tone="info">Scheduled</Badge>

// Role badges key off the role
<RoleBadge role="SUPER_ADMIN" />  <RoleBadge role="MEMBER" />

// Inline notices
<Alert tone="success" title="Invite sent">Provisioning completed and event memberships were queued.</Alert>
<Alert tone="danger" title="Unable to load accounts" action={<Button variant="secondary" size="sm">Retry</Button>}>
  Check access or retry the request.
</Alert>

// Metric cards
<StatCard label="USERS" value="1,248" sublabel="Provisioned app users" icon={UsersRound} />
```

Tones: `success` (emerald), `warning` (amber), `danger` (rose), `info` (blue), `neutral` (slate). Role tones: elevated→violet (SUPER ADMIN/OWNER), admin→blue (ADMIN/EVENT EDITOR), member→slate (MEMBER/VIEWER).
