"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react";

export type LeadProfileToolbarHandlers = {
  emailTrimmed: string;
  followUpDate: string | null;
  savingFollowUp: boolean;
  saving: boolean;
  dirty: boolean;
  save: () => void | Promise<void>;
  reset: () => void;
  commitFollowUpDate: (isoYmd: string | null) => void | Promise<void>;
};

type Ctx = {
  handlers: LeadProfileToolbarHandlers | null;
  setHandlers: Dispatch<SetStateAction<LeadProfileToolbarHandlers | null>>;
};

const LeadProfileToolbarContext = createContext<Ctx | null>(null);

export function LeadProfileToolbarProvider({ children }: { children: ReactNode }) {
  const [handlers, setHandlers] = useState<LeadProfileToolbarHandlers | null>(null);
  const value = useMemo(() => ({ handlers, setHandlers }), [handlers]);
  return <LeadProfileToolbarContext.Provider value={value}>{children}</LeadProfileToolbarContext.Provider>;
}

export function useLeadProfileToolbarSetter() {
  const ctx = useContext(LeadProfileToolbarContext);
  if (!ctx) {
    throw new Error("LeadProfileToolbarProvider is required");
  }
  return ctx.setHandlers;
}

export function useLeadProfileToolbarHandlers() {
  return useContext(LeadProfileToolbarContext)?.handlers ?? null;
}
