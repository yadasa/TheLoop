export class DomainError extends Error {
  constructor(
    public code:
      | "invalid-argument"
      | "permission-denied"
      | "not-found"
      | "failed-precondition"
      | "resource-exhausted"
      | "aborted"
      | "already-exists",
    message: string,
  ) {
    super(message);
  }
}
export type Doc = Record<string, any>;
export function assert(
  condition: unknown,
  code: DomainError["code"],
  message: string,
): asserts condition {
  if (!condition) throw new DomainError(code, message);
}
export function text(
  value: unknown,
  label: string,
  max: number,
  min = 1,
): string {
  assert(
    typeof value === "string",
    "invalid-argument",
    `${label} must be text.`,
  );
  const result = value.trim();
  assert(
    result.length >= min &&
      result.length <= max &&
      !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(result),
    "invalid-argument",
    `${label} must contain ${min}–${max} characters.`,
  );
  return result;
}
export function id(value: unknown): string {
  const result = text(value, "ID", 128);
  assert(
    /^[A-Za-z0-9_-]+$/.test(result),
    "invalid-argument",
    "Invalid resource ID.",
  );
  return result;
}
export function list(
  value: unknown,
  label: string,
  maxItems = 20,
  maxLength = 60,
): string[] {
  assert(
    Array.isArray(value) && value.length <= maxItems,
    "invalid-argument",
    `${label} must have no more than ${maxItems} items.`,
  );
  return [...new Set(value.map((item) => text(item, label, maxLength)))];
}
export function httpsUrl(value: unknown): string {
  const result = text(value, "URL", 2048);
  let url: URL;
  try {
    url = new URL(result);
  } catch {
    throw new DomainError("invalid-argument", "Use a valid HTTPS link.");
  }
  assert(
    url.protocol === "https:" && !url.username && !url.password,
    "invalid-argument",
    "Links must use HTTPS without embedded credentials.",
  );
  return url.href;
}
export function pairId(a: string, b: string): string {
  return [a, b].sort().join("~");
}
export function toggle(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
}
export function defaultPreferences(): Doc {
  return {
    subscriptions: {},
    joinedCommunityIds: [],
    followingIds: [],
    blockedIds: [],
    savedPostIds: [],
    readChannels: {},
    squadReadAt: {},
    squadMutedIds: [],
    dmMutedIds: [],
    interests: [],
    onboardingComplete: false,
    quietHours: false,
    quietStart: "22:00",
    quietEnd: "08:00",
    timezone: "UTC",
    digest: "daily",
    dmPolicy: "connections",
    hideUnsubscribed: true,
    eventReminders: true,
  };
}
export function rsvp(
  event: Doc,
  uid: string,
): { attendeeIds: string[]; waitlistIds: string[]; promotedId?: string } {
  const attendeeIds: string[] = [...(event.attendeeIds || [])];
  const waitlistIds: string[] = [...(event.waitlistIds || [])];
  if (attendeeIds.includes(uid)) {
    const remaining = attendeeIds.filter((v) => v !== uid);
    const promotedId = waitlistIds.shift();
    return {
      attendeeIds: promotedId ? [...remaining, promotedId] : remaining,
      waitlistIds,
      ...(promotedId ? { promotedId } : {}),
    };
  }
  if (waitlistIds.includes(uid))
    return { attendeeIds, waitlistIds: waitlistIds.filter((v) => v !== uid) };
  if (!event.capacity || attendeeIds.length < event.capacity)
    return { attendeeIds: [...attendeeIds, uid], waitlistIds };
  return { attendeeIds, waitlistIds: [...waitlistIds, uid] };
}
export function calculateTrust(
  profile: Doc,
  signals: Doc,
  now: string,
): { score: number; reasons: string[] } {
  let score = 10;
  const reasons = ["10 · Account in good standing"];
  if (signals.emailVerified) {
    score += 20;
    reasons.push("20 · Email address verified");
  }
  if (
    profile.name &&
    profile.headline &&
    profile.bio &&
    profile.skills?.length
  ) {
    score += 10;
    reasons.push("10 · Professional profile completed");
  }
  const age = Math.max(
    0,
    (Date.parse(now) - Date.parse(profile.joinedAt)) / 86_400_000,
  );
  const agePoints = Math.min(20, Math.floor(age / 30) * 2);
  if (agePoints) {
    score += agePoints;
    reasons.push(`${agePoints} · Account history (${Math.floor(age)} days)`);
  }
  const connectionPoints = Math.min(
    10,
    Math.max(0, Number(signals.acceptedConnections || 0)) * 2,
  );
  if (connectionPoints) {
    score += connectionPoints;
    reasons.push(
      `${connectionPoints} · Accepted community connections (capped)`,
    );
  }
  const attendancePoints = Math.min(
    20,
    Math.max(0, Number(signals.verifiedAttendance || 0)) * 5,
  );
  if (attendancePoints) {
    score += attendancePoints;
    reasons.push(
      `${attendancePoints} · Organizer-confirmed event participation`,
    );
  }
  const penalty = Math.min(
    50,
    Math.max(0, Number(signals.moderatorPenalty || 0)),
  );
  if (penalty) {
    score -= penalty;
    reasons.push(`−${penalty} · Reviewed moderation action; appeal available`);
  }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}
export function validatePreferences(patch: unknown): Doc {
  assert(
    patch && typeof patch === "object" && !Array.isArray(patch),
    "invalid-argument",
    "Invalid preferences.",
  );
  const safe: Doc = {};
  const allowed = [
    "quietHours",
    "quietStart",
    "quietEnd",
    "timezone",
    "digest",
    "dmPolicy",
    "hideUnsubscribed",
    "eventReminders",
  ];
  for (const [key, value] of Object.entries(patch)) {
    assert(
      allowed.includes(key),
      "invalid-argument",
      `Change ${key} using its dedicated action.`,
    );
    if (["quietHours", "hideUnsubscribed", "eventReminders"].includes(key))
      assert(
        typeof value === "boolean",
        "invalid-argument",
        "Invalid notification preference.",
      );
    if (key === "digest")
      assert(
        ["off", "daily", "weekly"].includes(value as string),
        "invalid-argument",
        "Invalid digest preference.",
      );
    if (key === "dmPolicy")
      assert(
        ["connections", "everyone", "nobody"].includes(value as string),
        "invalid-argument",
        "Invalid DM preference.",
      );
    if (["quietStart", "quietEnd"].includes(key))
      assert(
        typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
        "invalid-argument",
        "Quiet hours use HH:MM.",
      );
    if (key === "timezone") {
      text(value, "Timezone", 80);
      try {
        new Intl.DateTimeFormat("en", { timeZone: value as string });
      } catch {
        throw new DomainError("invalid-argument", "Use a valid timezone.");
      }
    }
    safe[key] = value;
  }
  return safe;
}
export function validateProfile(input: unknown): Doc {
  assert(
    input && typeof input === "object" && !Array.isArray(input),
    "invalid-argument",
    "Invalid profile.",
  );
  const safe: Doc = {};
  const max: Doc = {
    name: 80,
    headline: 160,
    company: 100,
    location: 120,
    bio: 2000,
  };
  for (const [key, value] of Object.entries(input)) {
    assert(
      [
        "name",
        "headline",
        "company",
        "location",
        "bio",
        "skills",
        "interests",
        "links",
        "visibility",
        "openTo",
      ].includes(key),
      "invalid-argument",
      `${key} is managed by TheLoop.`,
    );
    if (key in max)
      safe[key] = text(value, key, max[key], key === "name" ? 1 : 0);
    else if (["skills", "interests", "openTo"].includes(key))
      safe[key] = list(value, key);
    else if (key === "visibility") {
      assert(
        ["public", "connections"].includes(value as string),
        "invalid-argument",
        "Invalid profile visibility.",
      );
      safe[key] = value;
    } else if (key === "links") {
      assert(
        Array.isArray(value) && value.length <= 8,
        "invalid-argument",
        "Use up to eight profile links.",
      );
      safe.links = value.map((link) => ({
        label: text(link.label, "Link label", 40),
        url: httpsUrl(link.url),
      }));
    }
  }
  if (safe.name)
    safe.initials = safe.name
      .split(/\s+/)
      .slice(0, 2)
      .map((part: string) => part[0])
      .join("")
      .toUpperCase();
  return safe;
}
export function canMessage(
  senderId: string,
  receiverId: string,
  sender: Doc,
  receiver: Doc,
  connection: Doc | undefined,
): boolean {
  if (
    senderId === receiverId ||
    sender.preferences?.blockedIds?.includes(receiverId) ||
    receiver.preferences?.blockedIds?.includes(senderId)
  )
    return false;
  const policy = receiver.preferences?.dmPolicy || "connections";
  return (
    policy === "everyone" ||
    (policy === "connections" && connection?.status === "accepted")
  );
}
