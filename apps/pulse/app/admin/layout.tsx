import { requireSuperAdminForPage } from '@/lib/auth/require-super-admin'

export const dynamic = 'force-dynamic'

export default async function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdminForPage()
  return <>{children}</>
}
