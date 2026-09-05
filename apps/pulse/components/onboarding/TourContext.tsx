'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

type TourTab = 'locations' | 'consent' | 'branding' | 'billing' | 'users' | null

const TourContext = createContext<{
  tourTab: TourTab
  setTourTab: (tab: TourTab) => void
} | null>(null)

export function TourProvider({ children }: { children: ReactNode }) {
  const [tourTab, setTourTab] = useState<TourTab>(null)
  return (
    <TourContext.Provider value={{ tourTab, setTourTab }}>
      {children}
    </TourContext.Provider>
  )
}

export function useTourContext() {
  const ctx = useContext(TourContext)
  return ctx
}
