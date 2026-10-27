import type { Message } from "@theloop/core";

export function dayKey(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function dayLabel(timestamp: string, now = new Date()): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "Earlier messages";
  if (dayKey(timestamp) === dayKey(now.toISOString())) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(timestamp) === dayKey(yesterday.toISOString())) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear()
      ? { year: "numeric" as const }
      : {}),
  });
}

export function isMessageContinuation(
  previous: Message | undefined,
  next: Message,
): boolean {
  if (
    !previous ||
    next.replyTo ||
    previous.authorId !== next.authorId ||
    previous.channelId !== next.channelId ||
    previous.topic !== next.topic ||
    dayKey(previous.createdAt) !== dayKey(next.createdAt)
  )
    return false;
  const gap = Date.parse(next.createdAt) - Date.parse(previous.createdAt);
  return gap >= 0 && gap <= 5 * 60_000;
}

/** A quoted message must pass the same privacy checks as the conversation. */
export function visibleQuote(
  message: Message,
  messages: Message[],
  blockedIds: string[],
): Message | undefined {
  if (!message.replyTo) return undefined;
  return messages.find(
    (quoted) =>
      quoted.id === message.replyTo &&
      quoted.channelId === message.channelId &&
      !blockedIds.includes(quoted.authorId),
  );
}

export function topicStarter(topic: string): {
  title: string;
  body: string;
  draft: string;
} {
  if (/introduc/i.test(topic))
    return {
      title: "Who's coming?",
      body: "Share what you do and who you'd like to meet.",
      draft: "Hey everyone! I'm ",
    };
  if (/job|career|referral/i.test(topic))
    return {
      title: "Make the next connection",
      body: "Share a role, ask about a team, or offer a referral.",
      draft: "I'm looking for opportunities in ",
    };
  if (/travel|hotel|ride/i.test(topic))
    return {
      title: "Plan the trip together",
      body: "Talk arrivals, hotels and getting around. Keep private details in DMs.",
      draft: "Anyone else arriving on ",
    };
  if (/event|meetup|social/i.test(topic))
    return {
      title: "What's the plan?",
      body: "Share a meetup or ask who's going. Add the time and place when you have them.",
      draft: "Who's planning to go to ",
    };
  return {
    title: "Start the conversation",
    body: "Ask a question, share a plan, or say hello.",
    draft: "Hey everyone! ",
  };
}
