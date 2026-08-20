import Link from "next/link";
import type { ReactNode } from "react";

type NavItem = {
  label: string;
  href: string;
  icon: ReactNode;
  active?: boolean;
};

function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconTimeline() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6h12M10 12h8M6 18h10" />
    </svg>
  );
}

function IconDollar() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v20M17 6.5a4.5 4.5 0 0 0-4.5-2.5h-1a4.5 4.5 0 0 0 0 9h1a4.5 4.5 0 0 1 0 9h-1A4.5 4.5 0 0 1 7 19.5" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3.5" />
      <path d="M19 8a3 3 0 0 1 0 6M22 21v-2a4 4 0 0 0-3-3.87" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 11v4M13 13v2M17 10v5" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5M9 12h6M9 16h6" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z" />
      <path d="m19.4 15 1.2 2.1-2.1 2.1-2.1-1.2a7.8 7.8 0 0 1-1.8.8L14 21h-4l-.6-2.2a7.8 7.8 0 0 1-1.8-.8l-2.1 1.2-2.1-2.1L4.6 15a7.8 7.8 0 0 1-.1-1l-2-1.5 1.2-3 2.4.2a8.2 8.2 0 0 1 .8-1.3L5.8 6.1 8 4l2 1.2c.4-.1.9-.2 1.4-.2L12 2.5l3 .6v2.4a8 8 0 0 1 1.4.6L18.5 4 21 6.5l-1.2 2a8.2 8.2 0 0 1 .6 1.4l2.1.6v3l-2.2.6a7.5 7.5 0 0 1-.9 1.9z" />
    </svg>
  );
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <IconDashboard />, active: true },
  { label: "Events", href: "/events", icon: <IconCalendar /> },
  { label: "Timeline", href: "/timeline", icon: <IconTimeline /> },
  { label: "Budgets", href: "/budgets", icon: <IconDollar /> },
  { label: "Matrix", href: "/matrix", icon: <IconGrid /> },
  { label: "Seating", href: "/seating", icon: <IconUsers /> },
  { label: "Docs Hub", href: "/docs", icon: <IconFolder /> },
  { label: "Reports", href: "/reports", icon: <IconFile /> },
  { label: "Settings", href: "/settings", icon: <IconSettings /> },
];

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-700">
      <aside className="fixed inset-y-0 left-0 w-60 border-r border-slate-200 bg-white">
        <div className="flex h-20 items-center gap-3 border-b border-slate-200 px-6">
          <span className="text-3xl leading-none text-slate-800">|</span>
          <div>
            <h1 className="text-2xl font-semibold leading-none tracking-tight text-blue-900">Planner Dash</h1>
            <p className="mt-1 text-xs text-slate-500">Operations workspace</p>
          </div>
        </div>

        <nav className="space-y-1 px-6 py-6">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={[
                "flex h-16 items-center gap-4 rounded-2xl px-5 text-[22px] font-medium transition-colors",
                item.active
                  ? "bg-blue-800 text-white"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
              ].join(" ")}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <div className="ml-60 flex min-h-screen flex-col">
        <header className="flex h-20 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8">
          <div className="text-3xl font-semibold text-slate-700">Acme Events Inc</div>
          <div className="text-sm text-slate-500">Program Workspace</div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
