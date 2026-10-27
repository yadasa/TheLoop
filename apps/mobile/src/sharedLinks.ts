import { sharedTargetPath, type SharedTarget } from "@theloop/core";

declare const process: { env: Record<string, string | undefined> };

/** A configured web deployment lets recipients open links without the app. */
export function shareTargetURL(target: SharedTarget): string {
  return resolveShareTarget(target, process.env.EXPO_PUBLIC_WEB_URL).url;
}

export function resolveShareTarget(
  target: SharedTarget,
  configured?: string,
): { url: string; requiresApp: boolean } {
  const path = sharedTargetPath(target);
  try {
    if (configured) {
      const url = new URL(configured);
      if (
        (url.protocol === "https:" || url.protocol === "http:") &&
        !url.username &&
        !url.password
      ) {
        url.search = "";
        url.hash = path.slice(1);
        return { url: url.toString(), requiresApp: false };
      }
    }
  } catch {
    // A missing/invalid deployment setting still produces an installed-app link.
  }
  const query = path.includes("?") ? path.slice(path.indexOf("?")) : "";
  return {
    url: `theloop://${target.kind}/${encodeURIComponent(target.id)}${query}`,
    requiresApp: true,
  };
}
