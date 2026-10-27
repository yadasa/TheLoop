export type SharedTarget = {
  kind:
    | "post"
    | "event"
    | "profile"
    | "channel"
    | "community"
    | "squad"
    | "conference";
  id: string;
  topic?: string;
};

/** Record identifiers only. Links never grant membership or profile access. */
export function validLinkId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_-][A-Za-z0-9_.~-]{0,127}$/.test(value)
  );
}

const routeKinds: Record<string, SharedTarget["kind"]> = {
  post: "post",
  calendar: "event",
  event: "event",
  profile: "profile",
  conversations: "channel",
  channel: "channel",
  communities: "community",
  community: "community",
  squads: "squad",
  squad: "squad",
  conference: "conference",
  conferences: "conference",
};

export function parseSharedTarget(value: string): SharedTarget | null {
  if (value.length > 8192) return null;
  try {
    const url = new URL(value, "https://theloop.invalid");
    if (!["https:", "http:", "theloop:", "exp:"].includes(url.protocol))
      return null;
    const topic = new URLSearchParams(url.hash.split("?")[1] || url.search).get(
      "topic",
    );
    const channelTopic =
      topic && topic.length <= 100 && !/[\u0000-\u001f]/.test(topic)
        ? { topic }
        : {};
    // Existing query links continue to work after switching to hash navigation.
    for (const kind of [
      "post",
      "event",
      "profile",
      "channel",
      "community",
      "squad",
      "conference",
    ] as const) {
      const id = url.searchParams.get(kind);
      if (validLinkId(id))
        return { kind, id, ...(kind === "channel" ? channelTopic : {}) };
    }
    const path = url.hash.startsWith("#/")
      ? url.hash.slice(1).split("?")[0]
      : url.protocol === "theloop:"
        ? `/${url.hostname}${url.pathname}`
        : url.pathname;
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    if (url.protocol === "exp:" && parts[0] === "--") parts.shift();
    if (parts.length !== 2) return null;
    const kind = Object.hasOwn(routeKinds, parts[0])
      ? routeKinds[parts[0]]
      : undefined;
    return kind && validLinkId(parts[1])
      ? { kind, id: parts[1], ...(kind === "channel" ? channelTopic : {}) }
      : null;
  } catch {
    return null;
  }
}

export function sharedTargetPath(target: SharedTarget): string {
  if (!validLinkId(target.id)) throw new Error("This record cannot be linked.");
  const route = {
    post: "post",
    event: "calendar",
    profile: "profile",
    channel: "conversations",
    community: "communities",
    squad: "squads",
    conference: "conferences",
  }[target.kind];
  return `#/${route}/${encodeURIComponent(target.id)}${target.kind === "channel" && target.topic && target.topic.length <= 100 && !/[\u0000-\u001f]/.test(target.topic) ? `?topic=${encodeURIComponent(target.topic)}` : ""}`;
}
