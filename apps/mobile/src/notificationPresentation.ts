import { notificationAccessible } from "@theloop/core";
import type { LoopState, Notification } from "@theloop/core";
import type { Route, Tab } from "./navigation";

export type NotificationFilter =
  | "all"
  | "unread"
  | "message"
  | "connection"
  | "event"
  | "community";
export const notificationKinds: Record<
  Notification["kind"],
  { label: string; symbol: string }
> = {
  message: { label: "Message", symbol: "↗" },
  connection: { label: "Connection", symbol: "+" },
  event: { label: "Event", symbol: "◷" },
  community: { label: "Community", symbol: "◎" },
  squad: { label: "Squad", symbol: "◇" },
};

function actorFor(state: LoopState, notification: Notification) {
  if (notification.actorId || notification.dmSenderId)
    return notification.actorId || notification.dmSenderId;
  if (notification.kind === "connection") {
    const connection = state.connections.find(
      (c) => c.id === notification.targetId,
    );
    return connection
      ? connection.fromId === state.currentUserId
        ? connection.toId
        : connection.fromId
      : notification.targetId;
  }
  if (notification.kind === "message" && notification.id.endsWith("_dm"))
    return notification.targetId;
}

export function visibleNotifications(state: LoopState) {
  return state.notifications
    .filter(
      (n) =>
        notificationAccessible(state, n) &&
        !state.preferences.blockedIds.includes(actorFor(state, n) || ""),
    )
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
}

export function filterNotifications(
  items: Notification[],
  filter: NotificationFilter,
) {
  return items.filter(
    (n) =>
      filter === "all" ||
      (filter === "unread"
        ? !n.read
        : filter === "message"
          ? n.kind === "message" || n.kind === "squad"
          : n.kind === filter),
  );
}

export function notificationDay(createdAt: string, now = new Date()) {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return "Earlier";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date >= today && date.toDateString() === now.toDateString())
    return "Today";
  if (date >= yesterday && date < today) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear()
      ? { year: "numeric" as const }
      : {}),
  });
}

export function notificationDestination(
  state: LoopState,
  notification: Notification,
): { route?: Route; tab?: Tab; notice?: string } {
  const { kind, targetId: id } = notification;
  if (
    state.preferences.blockedIds.includes(actorFor(state, notification) || "")
  )
    return { notice: "This update is unavailable." };
  if (kind === "squad")
    return state.squads.some(
      (squad) =>
        squad.id === id &&
        squad.memberIds.includes(state.currentUserId) &&
        !squad.archived,
    )
      ? { route: { kind: "squad", id } }
      : {
          route: { kind: "squads" },
          notice: "This Squad is no longer available.",
        };
  if (kind === "event") return { route: { kind: "event", id } };
  if (kind === "message") {
    const channel = state.channels.find((c) => c.id === id);
    if (
      channel &&
      (channel.visibility === "public" ||
        channel.memberIds?.includes(state.currentUserId))
    )
      return {
        route: {
          kind: "channel",
          id,
          ...(notification.topic && channel.topics.includes(notification.topic)
            ? { topic: notification.topic }
            : {}),
        },
      };
    if (
      !channel &&
      (notification.dmSenderId ||
        notification.id.endsWith("_dm") ||
        state.profiles.some((p) => p.id === id))
    )
      return { route: { kind: "dm", id: notification.dmSenderId || id } };
    return { tab: "Chat", notice: "This group chat is no longer available." };
  }
  if (kind === "connection")
    return {
      route: { kind: "profile", id: actorFor(state, notification) || id },
    };
  // Posts have a dedicated document listener, so an older post can open even outside the feed window.
  if (kind === "community" && id !== "feed")
    return { route: { kind: "post", id } };
  return { tab: "Home" };
}
