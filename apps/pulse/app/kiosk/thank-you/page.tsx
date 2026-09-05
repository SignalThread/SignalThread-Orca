'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ThankYouGeneric } from '@/components/kiosk/ThankYouGeneric'

function ThankYouContent() {
  const searchParams = useSearchParams()
  const responseId = searchParams.get('responseId')
  const eventId = searchParams.get('eventId')

  return <ThankYouGeneric eventId={eventId} responseId={responseId} />
}

export default function KioskThankYouPage() {
  return (
    <Suspense fallback={<ThankYouGeneric />}>
      <ThankYouContent />
    </Suspense>
  )
}
