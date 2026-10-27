import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { readRoute, routeHash, type WebRoute } from "./routes";

export function useWebRoute() {
  const [route, setRoute] = useState(() => readRoute(window.location.href));
  const first = useRef(true);
  const replaceNext = useRef(false);
  useLayoutEffect(() => {
    const hash = routeHash(route);
    const url = new URL(window.location.href);
    for (const key of [
      "post",
      "event",
      "profile",
      "channel",
      "community",
      "squad",
      "conference",
    ])
      url.searchParams.delete(key);
    const previous = window.history.state;
    if (
      first.current ||
      window.location.hash !== hash ||
      url.search !== window.location.search
    ) {
      url.hash = hash;
      const state = {
        loopRoute: true,
        loopDetail: !!(route.postDetail || route.eventDetail),
        loopReturn:
          !first.current &&
          !!(route.postDetail || route.eventDetail) &&
          previous?.loopRoute
            ? window.location.href
            : null,
      };
      if (first.current || replaceNext.current)
        window.history.replaceState(state, "", url);
      else {
        window.history.pushState(state, "", url);
        if (!route.postDetail && !route.eventDetail) window.scrollTo(0, 0);
      }
    }
    first.current = false;
    replaceNext.current = false;
  }, [route]);
  useEffect(() => {
    const restore = () => setRoute(readRoute(window.location.href));
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, []);
  const set = useCallback(
    <K extends keyof WebRoute>(key: K, value: WebRoute[K]) =>
      setRoute((current) =>
        current[key] === value ? current : { ...current, [key]: value },
      ),
    [],
  );
  const reset = useCallback(() => {
    replaceNext.current = true;
    setRoute(
      readRoute(`${window.location.origin}${window.location.pathname}#/home`),
    );
  }, []);
  const closeDetail = useCallback(() => {
    if (window.history.state?.loopReturn) window.history.back();
    else {
      replaceNext.current = true;
      setRoute((current) => ({
        ...current,
        postDetail: null,
        eventDetail: null,
      }));
    }
  }, []);
  return { route, set, reset, closeDetail };
}
