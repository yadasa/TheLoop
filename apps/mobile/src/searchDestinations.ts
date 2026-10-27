import { subscriptionFor, type LoopState } from "@theloop/core";

export const searchText = (value: string) =>
  value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();

/** Search only the catalog already authorized for this signed-in account. */
export function searchDestinations(state: LoopState, query: string) {
  const q = searchText(query);
  const empty = { conferences: [], chats: [], communities: [] };
  if (!q || !state.currentUserId) return empty;
  const visibleChannels = state.channels.filter(
    (channel) =>
      (channel.visibility === "public" ||
        channel.memberIds?.includes(state.currentUserId)) &&
      subscriptionFor(state, channel.id, channel.conferenceId) !== "hidden",
  );
  const conferences = state.conferences
    .filter(
      (conference) =>
        state.preferences.subscriptions[conference.id] !== "hidden" &&
        visibleChannels.some(
          (channel) => channel.conferenceId === conference.id,
        ) &&
        searchText(
          `${conference.name} ${conference.shortName} ${conference.city}`,
        ).includes(q),
    )
    .slice(0, 12);
  const chats = visibleChannels
    .flatMap((channel) => {
      const topics = channel.topics.filter(
        (topic) =>
          state.preferences.subscriptions[`${channel.id}:${topic}`] !==
            "hidden" && searchText(topic).includes(q),
      );
      const conference = state.conferences.find(
        (item) => item.id === channel.conferenceId,
      );
      return searchText(
        `${channel.name} ${channel.description} ${conference?.name || ""}`,
      ).includes(q) || topics.length
        ? [{ channel, topics }]
        : [];
    })
    .slice(0, 20);
  const communities = state.communities
    .filter(
      (community) =>
        state.preferences.subscriptions[community.id] !== "hidden" &&
        searchText(
          `${community.name} ${community.slug} ${community.description}`,
        ).includes(q),
    )
    .slice(0, 20);
  return { conferences, chats, communities };
}
