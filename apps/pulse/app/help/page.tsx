import { Suspense } from 'react'
import { HelpPageContent, HelpPageFallback } from '@/components/admin/help/HelpPageContent'

export default function HelpPage() {
  return (
    <Suspense fallback={<HelpPageFallback />}>
      <HelpPageContent />
    </Suspense>
  )
}
