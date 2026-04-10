"use client";

import { useMemo } from "react";
import { authClient } from "@/lib/auth-client";
import { createApiClient } from "@/lib/api/client";

/**
 * Returns a memoised API client + a `ready` flag.
 * `ready` is true once Better Auth has loaded and the user is signed in.
 * Pages should put `ready` in their useEffect dependency array so API calls
 * re-fire once the session has hydrated (avoids 401s on first render).
 */
export function useApiClient() {
  const { data: session, isPending } = authClient.useSession();

  const ready = !isPending && !!session;

  // Fetches a short-lived HS256 JWT from /api/auth/token.
  // The NestJS API validates this JWT with BETTER_AUTH_SECRET.
  const safeGetToken = useMemo(
    () => async (): Promise<string | null> => {
      if (!session) return null;
      try {
        const res = await fetch("/api/auth/token");
        if (!res.ok) return null;
        const data = await res.json() as { token?: string };
        return data.token ?? null;
      } catch {
        return null;
      }
    },
    [session],
  );

  const api = useMemo(() => createApiClient(safeGetToken), [safeGetToken]);

  return { api, ready };
}
