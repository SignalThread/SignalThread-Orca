import Image from "next/image";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Code2,
  LayoutGrid,
  MoreHorizontal,
  Search,
  Settings,
  ShieldCheck,
  UserPlus,
  UsersRound,
} from "lucide-react";
import {
  Alert,
  Button,
  Card,
  DataTable,
  FilterPanel,
  FormField,
  IconActionButton,
  Input,
  Notice,
  PageHeader,
  PanelHeader,
  RoleBadge,
  SearchField,
  SectionHeader,
  SegmentedControl,
  Select,
  SidebarRail,
  SidebarRailItem,
  StatCard,
  StatusBadge,
  TableEmptyState,
  TableErrorState,
  TableLoadingState,
  Tabs,
  Textarea,
  TopBar,
  colors,
  radius,
  resolveStatusTone,
  shadows,
  spacing,
  typography,
} from "@signalthread/ui";

const accountRows = [
  {
    account: "Atlas Events",
    slug: "atlas-events",
    primaryAdmin: "alex@atlas.example",
    role: "OWNER",
    status: "Active",
    users: "42",
    events: "8",
  },
  {
    account: "Northstar Labs",
    slug: "northstar-labs",
    primaryAdmin: "morgan@northstar.example",
    role: "ADMIN",
    status: "Active",
    users: "18",
    events: "4",
  },
  {
    account: "Summit House",
    slug: "summit-house",
    primaryAdmin: "No primary admin",
    role: "VIEWER",
    status: "Needs setup",
    users: "7",
    events: "2",
  },
];

const tabItems = [
  { value: "overview", label: "Overview", count: 12 },
  { value: "users", label: "Users", count: 42 },
  { value: "events", label: "Events", count: 8 },
];

const statusSamples = [
  "Active",
  "Draft",
  "In Review",
  "Approved",
  "Rejected",
  "Needs setup",
  "Blocked",
  "Ready",
  "Scheduled",
  "Unknown",
];

const roleSamples = ["SUPER_ADMIN", "OWNER", "ADMIN", "MEMBER", "VIEWER", "EVENT_EDITOR"];

const foundationTokens = [
  { label: "Canvas", value: colors.semantic.canvas, className: "bg-[#f8f8fb]" },
  { label: "Card surface", value: colors.semantic.cardSurface, className: "bg-white" },
  { label: "Primary", value: colors.semantic.primaryAction, className: "bg-[#28439A]" },
  { label: "Shell nav", value: colors.semantic.shellNav, className: "bg-[#0B1638]" },
  { label: "Text primary", value: colors.semantic.textPrimary, className: "bg-slate-950" },
  { label: "Border subtle", value: colors.semantic.borderSubtle, className: "bg-slate-200" },
];

const brandTokens = [
  { label: "Brand navy", value: colors.brand.navy, className: "bg-[#183060]" },
  { label: "Brand blue", value: colors.brand.blue, className: "bg-[#3078C0]" },
  { label: "Brand cyan", value: colors.brand.cyan, className: "bg-[#30A8D8]" },
  { label: "Signal orange", value: colors.brand.signalOrange, className: "bg-[#F07830]" },
];

const densityGuidance = [
  "Use compact 44px controls for repeated operational workflows.",
  "Prefer white bordered panels on the #f8f8fb canvas.",
  "Keep headings tight and utilitarian inside dashboards and admin tools.",
  "Use horizontal table scroll where data requires columns; avoid hiding controls behind decoration.",
];

const doNotUseGuidance = [
  "Do not switch product UI from Montserrat to Geist Sans.",
  "Do not import Claude's generated HTML, JSX, or Google font CSS into product code.",
  "Do not replace the existing status or role tone maps with generated maps.",
  "Do not make global shell, radius, elevation, or DataTable API changes as a P0 refinement.",
];

function ModeSelector() {
  return <SegmentedControl items={tabItems} value="overview" compact ariaLabel="Design system mode selector" />;
}

function TokenSwatch({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className={`h-12 rounded-lg border border-slate-200 ${className}`} />
      <p className="mt-3 text-sm font-semibold text-slate-950">{label}</p>
      <p className="mt-1 font-mono text-[12px] text-slate-500">{value}</p>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <span className="text-right font-mono text-[12px] text-slate-500">{value}</span>
    </div>
  );
}

function ProductRail() {
  return (
    <SidebarRail
      brand={
        <div className="flex min-h-14 items-center gap-3">
          <div className="relative h-14 w-[260px]">
            <Image
              src="/brand/orcaos-logo.png"
              alt="OrcaOS"
              fill
              priority
              sizes="260px"
              className="object-contain"
            />
          </div>
        </div>
      }
      footer={
        <Card className="rounded-xl bg-slate-50 px-3 py-3 shadow-none">
          <p className="text-[12px] font-semibold tracking-wide text-slate-500 uppercase">Organization</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0B1638] text-[13px] font-bold text-white">
              AK
            </div>
            <div className="min-w-0">
              <p className="truncate text-[18px] leading-[20px] font-semibold text-slate-900">Atlas Keynotes</p>
              <p className="truncate text-[15px] text-slate-500">atlas-keynotes</p>
            </div>
          </div>
        </Card>
      }
    >
      <nav className="space-y-5" aria-label="Product navigation reference">
        <section aria-labelledby="design-system-account-nav">
          <h2
            id="design-system-account-nav"
            className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase"
          >
            Account
          </h2>
          <ul className="space-y-2" role="list">
            <li>
              <SidebarRailItem active icon={<LayoutGrid className="h-[17px] w-[17px]" />}>
                Command Center
              </SidebarRailItem>
            </li>
            <li>
              <SidebarRailItem icon={<CalendarDays className="h-[17px] w-[17px]" />}>Events</SidebarRailItem>
            </li>
          </ul>
        </section>
        <section aria-labelledby="design-system-organization-nav">
          <h2
            id="design-system-organization-nav"
            className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase"
          >
            Organization
          </h2>
          <ul className="space-y-2" role="list">
            <li>
              <SidebarRailItem icon={<Settings className="h-[17px] w-[17px]" />}>Settings</SidebarRailItem>
            </li>
          </ul>
        </section>
      </nav>
    </SidebarRail>
  );
}

function ProductTopBar() {
  return (
    <TopBar
      leading={<p className="text-sm font-semibold text-slate-500">SignalThread Design System</p>}
      actions={
        <>
          <IconActionButton icon={<Bell className="h-4 w-4" />} label="Notifications" />
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B1638] text-[12px] font-bold text-white">
            AK
          </div>
          <Button size="sm" variant="ghost">
            Log out
          </Button>
        </>
      }
    />
  );
}

export default function DesignSystemGalleryPage() {
  return (
    <div className="min-h-screen bg-[#f8f8fb] text-[14px] text-slate-700">
      <aside className="fixed inset-y-0 left-0 w-[280px]">
        <ProductRail />
      </aside>

      <div className="ml-[280px] flex min-h-screen flex-col">
        <ProductTopBar />
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="w-full max-w-[1100px] space-y-8">
            <PageHeader
              eyebrow="Source of truth"
              title="SignalThread UI Foundation"
              description="@signalthread/ui owns the product tokens, primitives, shell pieces, table states, badges, and tone maps. The Claude export is reference-only and should reinforce this system, not replace it."
              actions={<ModeSelector />}
            />

            <section className="space-y-5">
              <SectionHeader
                eyebrow="Foundations"
                title="Color, type, spacing, radius, and elevation"
                description="P0 keeps the current SignalThread look: Montserrat UI text, Geist Mono for code, #28439A actions, #f8f8fb canvas, white bordered cards, slate text, and restrained shadows."
              />

              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                {foundationTokens.map((token) => (
                  <TokenSwatch key={token.label} {...token} />
                ))}
              </div>

              <Card>
                <PanelHeader
                  title="Brand palette"
                  description="Brand colors support logo, identity, marketing, and occasional signal accents. They do not replace product semantic colors, status tones, warning, danger, or primary actions."
                />
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {brandTokens.map((token) => (
                    <TokenSwatch key={token.label} {...token} />
                  ))}
                </div>
                <Notice tone="warning" className="mt-4" title="Signal Orange is not a status tone">
                  Use Signal Orange for brand or signal-accent moments only. Keep warnings, danger states, primary
                  actions, and status badges on their existing semantic tokens.
                </Notice>
              </Card>

              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <PanelHeader
                    title="Typography"
                    description="Montserrat remains the product sans. Geist Mono is reserved for code, token values, IDs, and diagnostics."
                  />
                  <div className="mt-4 space-y-1">
                    <SpecRow label="Product sans" value={typography.semantic.productSans} />
                    <SpecRow label="Code mono" value={typography.semantic.codeMono} />
                    <SpecRow label="Base UI size" value={typography.fontSize.md} />
                    <SpecRow label="Label tracking" value={typography.letterSpacing.label} />
                  </div>
                </Card>

                <Card>
                  <PanelHeader
                    title="Spacing and radius"
                    description="Keep the current compact operational scale. Do not globally tighten radius as part of P0."
                  />
                  <div className="mt-4 space-y-1">
                    <SpecRow label="Control gap" value={spacing[2]} />
                    <SpecRow label="Panel padding" value={spacing[6]} />
                    <SpecRow label="Control radius" value={radius.xl} />
                    <SpecRow label="Card radius" value={radius["2xl"]} />
                  </div>
                </Card>

                <Card>
                  <PanelHeader
                    title="Elevation"
                    description="Use borders first, shadows second. Keep operational surfaces quiet and scannable."
                  />
                  <div className="mt-4 space-y-1">
                    <SpecRow label="Small shadow" value={shadows.sm} />
                    <SpecRow label="Card shadow" value={shadows.card} />
                    <SpecRow label="Popover shadow" value={shadows.popover} />
                  </div>
                </Card>
              </div>
            </section>

            <section className="space-y-5">
              <SectionHeader
                eyebrow="Operational density"
                title="Planner Dash guidance"
                description="Screens should prioritize repeated work, scanning, comparison, and predictable controls over decorative composition."
                count="P0"
              />

              <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
                <Card>
                  <PanelHeader title="Use this direction" description="These constraints preserve the current product feel." />
                  <ul className="mt-4 space-y-3">
                    {densityGuidance.map((item) => (
                      <li key={item} className="flex gap-3 text-sm text-slate-600">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </Card>

                <Card>
                  <PanelHeader title="Do not use from Claude" description="These are deferred because they would change the brand or product system." />
                  <ul className="mt-4 space-y-3">
                    {doNotUseGuidance.map((item) => (
                      <li key={item} className="flex gap-3 text-sm text-slate-600">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#28439A]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </section>

            <section className="space-y-5">
              <SectionHeader
                eyebrow="Product components"
                title="Admin surface reference"
                description="This section uses real @signalthread/ui components for shell, cards, forms, tables, badges, and controls."
              />

              <div className="grid gap-4 md:grid-cols-3">
                <StatCard
                  label="Users"
                  value="1,248"
                  detail="Provisioned app users"
                  icon={<UsersRound className="h-4 w-4" />}
                  tone="primary"
                />
                <StatCard
                  label="Invites"
                  value="36"
                  detail="Created this month"
                  icon={<UserPlus className="h-4 w-4" />}
                  tone="success"
                />
                <StatCard
                  label="Review"
                  value="5"
                  detail="Need platform attention"
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  tone="warning"
                />
              </div>

              <FilterPanel
                title="Filters"
                actions={
                  <Button size="sm" variant="secondary" trailingIcon={<ChevronDown className="h-4 w-4 text-slate-400" />}>
                    Status
                  </Button>
                }
              >
                <SearchField
                  leadingIcon={<Search className="h-4 w-4" />}
                  placeholder="Search accounts"
                  aria-label="Search accounts"
                />
                <Select className="md:max-w-[180px]" defaultValue="all">
                  <option value="all">All roles</option>
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </Select>
              </FilterPanel>

              <DataTable>
                <thead className="border-b border-slate-200 bg-slate-50 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="w-[26%] px-4 py-3">Account</th>
                    <th className="w-[24%] px-4 py-3">Primary admin</th>
                    <th className="w-[14%] px-4 py-3">Role</th>
                    <th className="w-[14%] px-4 py-3">Status</th>
                    <th className="w-[10%] px-4 py-3">Users</th>
                    <th className="w-[10%] px-4 py-3">Events</th>
                    <th className="w-[2%] px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accountRows.map((row) => (
                    <tr key={row.slug} className="align-middle">
                      <td className="px-4 py-3">
                        <p className="truncate text-sm font-semibold text-slate-950">{row.account}</p>
                        <p className="truncate text-xs text-slate-500">{row.slug}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{row.primaryAdmin}</td>
                      <td className="px-4 py-3">
                        <RoleBadge role={row.role} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} withDot>
                          {row.status}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{row.users}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{row.events}</td>
                      <td className="px-4 py-3">
                        <IconActionButton icon={<MoreHorizontal className="h-4 w-4" />} label={`Actions for ${row.account}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </section>

            <section className="space-y-5">
              <SectionHeader
                eyebrow="Forms"
                title="Forms and validation"
                description="FormField owns label, helper, error, required, disabled, aria-invalid, and described-by wiring around shared inputs."
              />

              <Card>
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="Email" helperText="Used for invite and sign-in delivery." required>
                    <Input type="email" value="planner@example.com" readOnly />
                  </FormField>
                  <FormField label="Organization" required>
                    <Select defaultValue="atlas">
                      <option value="atlas">Atlas Keynotes</option>
                      <option value="summit">Summit House</option>
                    </Select>
                  </FormField>
                  <FormField label="Role" helperText="Role labels stay controlled by the product surface.">
                    <Select defaultValue="MEMBER">
                      <option>OWNER</option>
                      <option>ADMIN</option>
                      <option>MEMBER</option>
                      <option>VIEWER</option>
                    </Select>
                  </FormField>
                  <FormField label="Disabled field" disabled helperText="Disabled controls inherit the field state.">
                    <Input value="Read only while syncing" readOnly />
                  </FormField>
                  <FormField label="Invite note" helperText="Optional internal context." className="md:col-span-2">
                    <Textarea value="Add this user to the event workspace after invite acceptance." readOnly />
                  </FormField>
                  <FormField
                    label="Slug"
                    errorText="Use lowercase letters, numbers, and hyphens only."
                    className="md:col-span-2"
                  >
                    <Input value="Atlas Events" readOnly />
                  </FormField>
                </div>
              </Card>
            </section>

            <section className="space-y-5">
              <SectionHeader
                eyebrow="Navigation controls"
                title="Tabs and segmented controls"
                description="Button tabs support counts; segmented controls match compact mode selectors used in admin surfaces."
              />

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <PanelHeader title="Count tabs" description="For status groups, queues, and table filters." />
                  <div className="mt-4">
                    <Tabs items={tabItems} value="users" ariaLabel="Count tab reference" />
                  </div>
                </Card>
                <Card>
                  <PanelHeader title="Compact segmented control" description="For mode selectors and small view switches." />
                  <div className="mt-4">
                    <SegmentedControl items={tabItems} value="overview" compact ariaLabel="Compact segmented reference" />
                  </div>
                </Card>
              </div>
            </section>

            <section className="space-y-5">
              <SectionHeader
                eyebrow="Feedback"
                title="Alerts, notices, status, and role tones"
                description="Tone usage stays centralized in @signalthread/ui. Claude generated tone maps should not replace these mappings."
              />

              <div className="space-y-3">
                <Notice tone="success" title="Invite sent">
                  Provisioning completed and event memberships were queued.
                </Notice>
                <Notice tone="warning" title="Review needed">
                  Some imported rows need a status mapping before save.
                </Notice>
                <Alert tone="danger" title="Unable to load accounts" action={<Button size="sm" variant="secondary">Retry</Button>}>
                  Check access or retry the request.
                </Alert>
                <Notice tone="info">Audience import preview is ready for review.</Notice>
                <Notice tone="neutral">No filters are currently applied.</Notice>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_0.75fr]">
                <Card>
                  <PanelHeader title="Status badges" description="Resolved by status label when a tone is not supplied." />
                  <div className="mt-4 flex flex-wrap gap-2">
                    {statusSamples.map((status) => (
                      <StatusBadge key={status} status={status} withDot>
                        {status}
                      </StatusBadge>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-2 text-[12px] text-slate-500 sm:grid-cols-2">
                    {statusSamples.slice(0, 6).map((status) => (
                      <p key={status}>
                        {status}: <span className="font-semibold text-slate-700">{resolveStatusTone(status)}</span>
                      </p>
                    ))}
                  </div>
                </Card>
                <Card>
                  <PanelHeader title="Role badges" description="Resolved by role key without changing labels." />
                  <div className="mt-4 flex flex-wrap gap-2">
                    {roleSamples.map((role) => (
                      <RoleBadge key={role} role={role} />
                    ))}
                  </div>
                </Card>
              </div>
            </section>

            <section className="space-y-5">
              <SectionHeader
                eyebrow="Tables"
                title="Empty, loading, and error states"
                description="State helpers render compatible table bodies while preserving the current compositional DataTable API."
              />

              <div className="grid gap-4 xl:grid-cols-3">
                <DataTable tableClassName="min-w-[360px]">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <TableEmptyState
                    colSpan={2}
                    title="No users found"
                    description="Try clearing filters or inviting a user."
                    action={<Button size="sm" variant="secondary">Clear filters</Button>}
                  />
                </DataTable>
                <DataTable tableClassName="min-w-[360px]">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <TableLoadingState colSpan={2} rows={4} columns={2} />
                </DataTable>
                <DataTable tableClassName="min-w-[360px]">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <TableErrorState
                    colSpan={2}
                    title="Rows could not load"
                    description="The table keeps its frame while surfacing the error."
                    action={<Button size="sm" variant="secondary">Retry</Button>}
                  />
                </DataTable>
              </div>
            </section>

            <section className="space-y-5">
              <SectionHeader
                eyebrow="Implementation note"
                title="Reference-only Claude export"
                description="Use Claude's export to validate the current direction: soft canvas, white surfaces, slate hierarchy, restrained shadows, and indigo primary. Do not import the generated files or allow them to redefine fonts, shell layout, table API, radius, or elevation."
              />

              <Card>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-2xl">
                    <PanelHeader
                      title="Package first"
                      description="Approved refinements should land in @signalthread/ui tokens and components first, then be adopted screen-by-screen."
                    />
                  </div>
                  <StatusBadge tone="primary" withDot>
                    P0 safe refinements only
                  </StatusBadge>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button size="sm" leadingIcon={<Code2 className="h-4 w-4" />}>
                    @signalthread/ui
                  </Button>
                  <Button size="sm" variant="secondary">
                    Montserrat
                  </Button>
                  <Button size="sm" variant="secondary">
                    Geist Mono
                  </Button>
                </div>
              </Card>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
