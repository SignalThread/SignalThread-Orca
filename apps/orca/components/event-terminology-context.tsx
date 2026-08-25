"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ORCA_CANONICAL_TERMS, type OrcaTerminology } from "@/lib/orca-terminology-contract";

const EventTerminologyContext = createContext<OrcaTerminology>({ ...ORCA_CANONICAL_TERMS });

export function EventTerminologyProvider({ terms, children }: { terms: OrcaTerminology; children: ReactNode }) {
  return <EventTerminologyContext.Provider value={terms}>{children}</EventTerminologyContext.Provider>;
}

export function useEventTerminology(): OrcaTerminology {
  return useContext(EventTerminologyContext);
}
