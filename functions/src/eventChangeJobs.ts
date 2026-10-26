import { createHash } from "node:crypto";
import { assert, Doc } from "./policy";
import type { TransactionStore } from "./service";

const digest = (...parts: string[]) =>
  createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 40);
export const eventChangeJobId = (event: Doc) =>
  `event-${digest(event.id, String(event.sequence))}`;

export function eventChangeJob(
  event: Doc,
  actorId: string,
  promotedIds: string[],
  changedFields: string[],
  now: string,
): Doc {
  const recipientIds = [
    ...new Set<string>([
      ...(event.attendeeIds || []),
      ...(event.waitlistIds || []),
    ]),
  ].filter((uid) => uid !== actorId);
  assert(
    recipientIds.length <= 1500,
    "failed-precondition",
    "This event notification audience needs review.",
  );
  return {
    id: eventChangeJobId(event),
    eventId: event.id,
    sequence: event.sequence || 0,
    actorId,
    kind: event.status === "cancelled" ? "cancelled" : "updated",
    recipientIds,
    promotedIds,
    changedFields,
    createdAt: now,
    cursor: 0,
    processed: 0,
    status: "pending",
  };
}

/** A bounded transaction commits cursor progress together with deterministic notices. */
export async function processEventChangePage(
  store: TransactionStore,
  jobId: string,
  now: string,
  limit = 50,
): Promise<Doc> {
  assert(
    Number.isInteger(limit) && limit >= 1 && limit <= 100,
    "invalid-argument",
    "Invalid event notification batch size.",
  );
  const path = `eventChangeJobs/${jobId}`,
    job = await store.get(path);
  if (!job || job.status !== "pending") return { processed: 0, complete: true };
  const event = await store.get(`events/${job.eventId}`);
  if (
    !event ||
    (event.sequence || 0) !== job.sequence ||
    (job.kind === "updated" && event.status === "cancelled")
  ) {
    store.set(path, { ...job, status: "superseded", updatedAt: now });
    return { processed: 0, complete: true };
  }
  const recipients: string[] = job.recipientIds.slice(
    job.cursor,
    job.cursor + limit,
  );
  let delivered = 0;
  for (const uid of recipients) {
    const user = await store.get(`users/${uid}`);
    if (
      !user ||
      user.disabled ||
      user.deletionPending ||
      user.preferences?.blockedIds?.some(
        (id: string) => id === event.hostId || id === job.actorId,
      )
    )
      continue;
    const noticeId = `event-change-${digest(job.id, uid)}`,
      noticePath = `notifications/${noticeId}`;
    if (await store.get(noticePath)) continue;
    const promoted = job.promotedIds.includes(uid),
      cancelled = job.kind === "cancelled";
    store.set(noticePath, {
      id: noticeId,
      userId: uid,
      title: cancelled
        ? "An event was cancelled"
        : promoted
          ? "You’re off the waitlist"
          : "An event you follow has changed",
      body: cancelled
        ? `${event.title} was cancelled.${event.cancellationReason ? ` ${event.cancellationReason}` : ""}`
        : promoted
          ? `A spot opened for ${event.title}. You’re now going.`
          : `${event.title} has updated details. Open the event for the latest plan.`,
      kind: "event",
      targetId: event.id,
      eventSequence: job.sequence,
      eventActorId: job.actorId,
      eventNoticeType: cancelled
        ? "cancelled"
        : promoted
          ? "promoted"
          : "updated",
      createdAt: now,
      read: false,
      unreadUserId: uid,
    });
    delivered++;
  }
  const cursor = job.cursor + recipients.length,
    complete = cursor >= job.recipientIds.length;
  store.set(path, {
    ...job,
    cursor,
    processed: Number(job.processed || 0) + delivered,
    status: complete ? "complete" : "pending",
    updatedAt: now,
  });
  return { processed: recipients.length, delivered, complete };
}

export function eventReminderEligible(
  event: Doc | undefined,
  uid: string,
  user: Doc | undefined,
  now: string,
): boolean {
  if (
    !event ||
    event.status === "cancelled" ||
    !event.attendeeIds?.includes(uid) ||
    !user ||
    user.disabled ||
    user.deletionPending ||
    user.preferences?.eventReminders === false ||
    user.preferences?.blockedIds?.includes(event.hostId)
  )
    return false;
  const instant = Date.parse(now),
    start = Date.parse(event.startAt);
  return (
    Number.isFinite(start) && start > instant && start <= instant + 30 * 60000
  );
}

export function eventReminderNotice(event: Doc, uid: string, now: string): Doc {
  // A moved start produces a fresh reminder; cosmetic edits do not duplicate a reminder.
  const id = `event-reminder-${digest(event.id, uid, event.startAt)}`;
  return {
    id,
    userId: uid,
    kind: "event",
    eventNoticeType: "reminder",
    eventStartAt: event.startAt,
    targetId: event.id,
    title: "Your next good conversation is coming up",
    body: "An event you RSVPed to starts soon. Open it for the latest details.",
    createdAt: now,
    read: false,
    unreadUserId: uid,
  };
}

/** Candidate queries never authorize a notice: reread current event, RSVP and user in one transaction. */
export async function createEventReminder(
  store: TransactionStore,
  eventId: string,
  uid: string,
  now: string,
): Promise<boolean> {
  const [event, user] = await Promise.all([
    store.get(`events/${eventId}`),
    store.get(`users/${uid}`),
  ]);
  if (!eventReminderEligible(event, uid, user, now)) return false;
  const notice = eventReminderNotice(event!, uid, now),
    path = `notifications/${notice.id}`;
  if (await store.get(path)) return false;
  store.set(path, notice);
  return true;
}

/** Used immediately before push: cancellation/rescheduling and withdrawal revoke stale reminders. */
export function eventNoticeCurrent(
  notice: Doc,
  event: Doc | undefined,
  uid: string,
  user: Doc | undefined,
  now: string,
): boolean {
  if (notice.kind !== "event") return true;
  if (
    !event ||
    !user ||
    user.disabled ||
    user.deletionPending ||
    user.preferences?.blockedIds?.some(
      (id: string) => id === event.hostId || id === notice.eventActorId,
    )
  )
    return false;
  if (notice.eventNoticeType === "reminder")
    return (
      event.startAt === notice.eventStartAt &&
      eventReminderEligible(event, uid, user, now)
    );
  if (
    notice.eventNoticeType === "promoted" &&
    !event.attendeeIds?.includes(uid)
  )
    return false;
  if (notice.eventSequence !== undefined)
    return (
      notice.eventSequence === (event.sequence || 0) &&
      (notice.eventNoticeType === "cancelled"
        ? event.status === "cancelled"
        : event.status !== "cancelled")
    );
  return event.status !== "cancelled";
}

/** Removing a recipient before the saved cursor must not skip the next queued recipient. */
export function scrubEventChangeJob(job: Doc, uid: string): Doc {
  const recipientIds: string[] = job.recipientIds || [],
    cursor = Number(job.cursor || 0);
  return {
    ...job,
    recipientIds: recipientIds.filter((id) => id !== uid),
    cursor: Math.max(
      0,
      cursor - recipientIds.slice(0, cursor).filter((id) => id === uid).length,
    ),
    promotedIds: (job.promotedIds || []).filter((id: string) => id !== uid),
    ...(job.actorId === uid ? { actorId: "deleted-member" } : {}),
  };
}

export function eventChangeJobExpired(job: Doc, now: string): boolean {
  const updated = Date.parse(job.updatedAt || job.createdAt || "");
  return (
    ["complete", "superseded"].includes(job.status) &&
    Number.isFinite(updated) &&
    updated < Date.parse(now) - 7 * 86400000
  );
}
