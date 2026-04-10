"use client";

import { useEffect } from "react";
import { useApiClient } from "@/lib/hooks/useApiClient";
import { useDashboardStore } from "@/lib/store/dashboard";

/**
 * Hydrates the dashboard Zustand store with real data from the API.
 * Runs once after Clerk auth is ready. Falls back to seed data silently.
 */
export default function DashboardProvider({ children }: { children: React.ReactNode }) {
  const { api, ready } = useApiClient();
  const hydrate        = useDashboardStore((s) => s.hydrate);

  useEffect(() => {
    if (!ready) return;
    hydrate(api);
  }, [api, ready, hydrate]);

  return <>{children}</>;
}
