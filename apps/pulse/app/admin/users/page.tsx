import { requireSuperAdminForPage } from '@/lib/auth/require-super-admin'
import { PlatformUsersPageClient } from '@/components/admin/PlatformUsersPageClient'

export const dynamic = 'force-dynamic'

export default async function PlatformUsersPage() {
  await requireSuperAdminForPage()
  return <PlatformUsersPageClient />
}
