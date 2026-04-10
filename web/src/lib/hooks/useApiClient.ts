"use client";

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { createApiClient } from "@/lib/api/client";

/**
 * Returns a memoised API client + a `ready` flag.
 * `ready` is true once Clerk has loaded and the user is signed in.
 * Pages should put `ready` in their useEffect dependency array so API calls
 * re-fire once Clerk has hydrated (avoids "No bearer token" 401s on first render).
 */
export function useApiClient() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const ready = isLoaded && !!isSignedIn;

  // Wraps getToken so requests made before Clerk is ready return null safely
  // (the API client already skips the Authorization header when token is null)
  const safeGetToken = useMemo(() => async () => {
    if (!isLoaded || !isSignedIn) return null;
    return getToken();
  }, [getToken, isLoaded, isSignedIn]);

  const api = useMemo(() => createApiClient(safeGetToken), [safeGetToken]);

  return { api, ready };
}
