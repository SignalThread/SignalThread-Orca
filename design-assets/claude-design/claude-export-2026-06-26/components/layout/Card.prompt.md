Layout containers. `Card` is the white, border-led surface used everywhere; `PanelHeader` is the standard title block inside it.

```jsx
<Card>
  <PanelHeader
    eyebrow="PANEL"
    title="Invite and provision user"
    meta="Updated today"
    description="Panel headers keep titles, metadata, and actions consistent without owning domain copy."
    action={<Button icon={UserPlus}>Invite</Button>}
  />
</Card>
```

Cards are border-led (slate-200) with a whisper shadow and 16px radius — never heavy drop shadows. Set `interactive` for clickable cards (border darkens on hover).
