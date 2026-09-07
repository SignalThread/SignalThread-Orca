'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const destinations = [
  { href: '/admin', label: 'Accounts' },
  { href: '/admin/users', label: 'Users' },
]

export function PlatformAdminNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Platform administration" className="mb-6 flex w-fit rounded-lg bg-zinc-200/70 p-1 dark:bg-zinc-800">
      {destinations.map((item) => {
        const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${active ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white'}`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
