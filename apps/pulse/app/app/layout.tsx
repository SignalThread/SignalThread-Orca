'use client'

import { Suspense } from 'react'
import { TourProvider } from '@/components/onboarding/TourContext'
import { ProductTour } from '@/components/onboarding/ProductTour'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <TourProvider>
      {children}
      <Suspense fallback={null}>
        <ProductTour />
      </Suspense>
    </TourProvider>
  )
}
