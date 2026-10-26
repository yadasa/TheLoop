import { sharedTargetPath, type SharedTarget } from "@theloop/core";

declare const process: { env: Record<string, string | undefined> };

/** A configured web deployment lets recipients open links without the app. */
export function shareTargetURL(target: SharedTarget): string {
  const path = sharedTargetPath(target);
  try {
    const configured = process.env.EXPO_PUBLIC_WEB_URL;
    if (configured) {
      const url = new URL(configured);
      if (
        (url.protocol === "https:" || url.protocol === "http:") &&
        !url.username &&
        !url.password
      ) {
        url.search = "";
        url.hash = path.slice(1);
        return url.toString();
      }
    }
  } catch {
    // A missing/invalid deployment setting still produces an installed-app link.
  }
  const query = path.includes("?") ? path.slice(path.indexOf("?")) : "";
  return `theloop://${target.kind}/${encodeURIComponent(target.id)}${query}`;
}
