import type { ComponentPropsWithoutRef, ReactNode } from 'react'

/** Shared white list surface and item rhythm for Event Workspace entities. */
export function EventEntityListShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[18px] border border-[#e8ebf2] bg-white p-4 shadow-[0_1px_2px_rgba(11,22,56,0.04)] dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>{children}</section>
}

/** Separate item treatment keeps dense entity lists scannable without table rows. */
export function EventEntityCard({ children, selected = false, className = '', ...props }: { children: ReactNode; selected?: boolean; className?: string } & Omit<ComponentPropsWithoutRef<'article'>, 'children' | 'className'>) {
  return <article {...props} className={`rounded-xl border p-4 transition-colors ${selected ? 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-950/20' : 'border-slate-200 bg-white hover:border-slate-300 dark:border-zinc-800 dark:bg-zinc-950'} ${className}`}>{children}</article>
}
