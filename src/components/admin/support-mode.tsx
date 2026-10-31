"use client";

import { createContext, useContext } from "react";

/** True inside a platform-admin "Uđi kao" session — unlocks support-only tools (e.g. deleting a booking). */
const SupportModeContext = createContext(false);

export function SupportModeProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <SupportModeContext.Provider value={value}>{children}</SupportModeContext.Provider>;
}

export function useSupportMode(): boolean {
  return useContext(SupportModeContext);
}
