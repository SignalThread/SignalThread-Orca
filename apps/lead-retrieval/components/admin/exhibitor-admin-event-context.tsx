"use client";

import { createContext, useContext } from "react";

export type ExhibitorAdminEventContextValue = {
  activeEventId: string | null;
};

const ExhibitorAdminEventContext = createContext<ExhibitorAdminEventContextValue | null>(null);

export function ExhibitorAdminEventProvider({
  value,
  children
}: {
  value: ExhibitorAdminEventContextValue;
  children: React.ReactNode;
}) {
  return <ExhibitorAdminEventContext.Provider value={value}>{children}</ExhibitorAdminEventContext.Provider>;
}

export function useExhibitorAdminActiveEvent(): ExhibitorAdminEventContextValue | null {
  return useContext(ExhibitorAdminEventContext);
}
