import { useCallback, useEffect, useRef, useState } from "react";
import { guideEventsURL, type GuideEventFilters } from "@theloop/core";
import { emptyGuideResult, GuideRequests, type GuideRequestState } from "./guideRequest";

export type GuideEventsState = GuideRequestState & { refresh(): void };

export function useGuideEvents(filters: GuideEventFilters = {}, enabled = true): GuideEventsState {
  const requests = useRef<GuideRequests | null>(null);
  requests.current ??= new GuideRequests();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<GuideRequestState & { key: string }>({ ...emptyGuideResult(), key: "", loading: false, error: null });
  let url = "", validationError: string | null = null;
  try { url = guideEventsURL(filters); }
  catch (error) { validationError = error instanceof Error ? error.message : "Choose valid Guide filters."; }
  const key = enabled ? `${url || validationError}#${attempt}` : "disabled";
  const refresh = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (!enabled || validationError) {
      requests.current!.cancel();
      setState({ ...emptyGuideResult(), key, loading: false, error: enabled ? validationError : null });
      return;
    }
    // Reconstruct from the stable public URL; object identity changes cannot cause refetch loops.
    const params = new URL(url).searchParams;
    const requestFilters: GuideEventFilters = { limit: Number(params.get("limit") ?? 50) };
    for (const name of ["q", "category", "date", "after", "before", "tags"] as const) if (params.has(name)) requestFilters[name] = params.get(name)!;
    return requests.current!.start(requestFilters, next => setState({ ...next, key }));
  }, [url, key, enabled, validationError]);
  // Mask prior filters immediately, before the effect's cancellation runs.
  if (state.key !== key) return { ...emptyGuideResult(Number.isInteger(filters.limit) && filters.limit! >= 1 && filters.limit! <= 50 ? filters.limit : 50), loading: enabled && !validationError, error: enabled ? validationError : null, refresh };
  return { ...state, refresh };
}
