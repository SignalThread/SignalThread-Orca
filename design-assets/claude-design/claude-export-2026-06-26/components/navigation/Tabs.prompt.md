Tab and switch controls. `Tabs` are button-style count tabs for status groups and table filters; `SegmentedControl` is the compact pill switcher for mode/view changes.

```jsx
<Tabs value={tab} onChange={setTab} items={[
  { key: "overview", label: "Overview", count: 12 },
  { key: "users", label: "Users", count: 42 },
  { key: "events", label: "Events", count: 8 },
]} />

<SegmentedControl value={mode} onChange={setMode}
  items={[{key:"overview",label:"Overview",count:12},{key:"users",label:"Users",count:42}]} />
```

Use `Tabs` for primary in-page navigation between record sets; `SegmentedControl` for small, local view toggles.
