import {
  parseSharedTarget,
  sharedTargetPath,
  validLinkId,
} from "@theloop/core";
export type Page =
  | "home"
  | "chat"
  | "communities"
  | "calendar"
  | "people"
  | "saved"
  | "profile"
  | "inbox"
  | "squads";
export type WebRoute = {
  page: Page;
  channelId: string;
  topic: string;
  communityId: string;
  profileId: string;
  dmId: string;
  squadId: string;
  postDetail: string | null;
  eventDetail: string | null;
};
export const initialRoute: WebRoute = {
  page: "home",
  channelId: "the-lobby",
  topic: "All topics",
  communityId: "all",
  profileId: "",
  dmId: "",
  squadId: "",
  postDetail: null,
  eventDetail: null,
};
export function readRoute(href: string): WebRoute {
  const route = { ...initialRoute };
  try {
    const url = new URL(href),
      target = parseSharedTarget(href);
    const path = url.hash.slice(1).split("?")[0];
    const page = (
      {
        "/home": "home",
        "/conversations": "chat",
        "/communities": "communities",
        "/calendar": "calendar",
        "/people": "people",
        "/saved": "saved",
        "/inbox": "inbox",
        "/squads": "squads",
      } as Record<string, Page>
    )[path];
    if (page) route.page = page;
    if (target) {
      if (target.kind === "post") route.postDetail = target.id;
      if (target.kind === "event") {
        route.page = "calendar";
        route.eventDetail = target.id;
      }
      if (target.kind === "profile") {
        route.page = "profile";
        route.profileId = target.id;
      }
      if (target.kind === "channel") {
        route.page = "chat";
        route.channelId = target.id;
        if (target.topic) route.topic = target.topic;
      }
      if (target.kind === "community") {
        route.page = "communities";
        route.communityId = target.id;
      }
      if (target.kind === "squad") {
        route.page = "squads";
        route.squadId = target.id;
      }
    }
    const inbox = /^\/inbox\/([^/]+)$/.exec(path);
    if (inbox) {
      const id = decodeURIComponent(inbox[1]);
      if (validLinkId(id)) {
        route.page = "inbox";
        route.dmId = id;
      }
    }
    const topic = new URLSearchParams(url.hash.split("?")[1] || "").get(
      "topic",
    );
    if (
      route.page === "chat" &&
      topic &&
      topic.length <= 100 &&
      !/[\u0000-\u001f]/.test(topic)
    )
      route.topic = topic;
  } catch {
    /* malformed incoming URLs open the home view */
  }
  return route;
}
export function routeHash(route: WebRoute): string {
  if (route.postDetail && validLinkId(route.postDetail))
    return sharedTargetPath({ kind: "post", id: route.postDetail });
  if (route.eventDetail && validLinkId(route.eventDetail))
    return sharedTargetPath({ kind: "event", id: route.eventDetail });
  if (route.page === "chat")
    return `${validLinkId(route.channelId) ? sharedTargetPath({ kind: "channel", id: route.channelId }) : "#/conversations"}${route.topic !== "All topics" ? `?topic=${encodeURIComponent(route.topic)}` : ""}`;
  if (route.page === "profile" && validLinkId(route.profileId))
    return sharedTargetPath({ kind: "profile", id: route.profileId });
  if (
    route.page === "communities" &&
    route.communityId !== "all" &&
    validLinkId(route.communityId)
  )
    return sharedTargetPath({ kind: "community", id: route.communityId });
  if (route.page === "squads" && validLinkId(route.squadId))
    return sharedTargetPath({ kind: "squad", id: route.squadId });
  if (route.page === "inbox" && validLinkId(route.dmId))
    return `#/inbox/${encodeURIComponent(route.dmId)}`;
  return `#/${route.page}`;
}
