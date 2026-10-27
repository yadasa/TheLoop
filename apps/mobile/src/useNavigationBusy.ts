import { useLayoutEffect } from "react";
import type { Nav } from "./navigation";

/** Keep an in-flight send attached to its composer until its result is known. */
export function useNavigationBusy(nav: Nav, key: string, busy: boolean) {
  useLayoutEffect(() => {
    nav.lockNavigation(key, busy);
    return () => nav.lockNavigation(key, false);
  }, [key, busy, nav.lockNavigation]);
}
