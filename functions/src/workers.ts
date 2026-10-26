import { getFirestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { Doc } from "./policy";
import { digestContent, digestSlot } from "./notifications";

async function createNoticeOnce(
  notificationId: string,
  notice: Doc,
): Promise<boolean> {
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`notifications/${notificationId}`);
    const existing = await tx.get(ref);
    if (existing.exists) return false;
    tx.create(ref, {
      id: notificationId,
      ...notice,
      unreadUserId: notice.userId,
    });
    return true;
  });
}

export const sendEventReminders = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "UTC",
    timeoutSeconds: 540,
    memory: "256MiB",
    maxInstances: 1,
  },
  async () => {
    const db = getFirestore();
    const now = new Date();
    const upper = new Date(now.getTime() + 30 * 60_000).toISOString();
    let cursor: QueryDocumentSnapshot | undefined;
    for (;;) {
      let query = db
        .collection("events")
        .where("startAt", ">", now.toISOString())
        .where("startAt", "<=", upper)
        .orderBy("startAt")
        .limit(100);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      if (page.empty) break;
      for (const event of page.docs) {
        const data = event.data();
        for (
          let offset = 0;
          offset < (data.attendeeIds?.length || 0);
          offset += 20
        ) {
          const ids: string[] = data.attendeeIds.slice(offset, offset + 20);
          const users = await db.getAll(
            ...ids.map((uid) => db.doc(`users/${uid}`)),
          );
          await Promise.all(
            users.map(async (user) => {
              if (
                !user.exists ||
                user.get("disabled") ||
                user.get("deletionPending")
              )
                return;
              const preferences = user.get("preferences") || {};
              if (
                preferences.eventReminders === false ||
                preferences.blockedIds?.includes(data.hostId)
              )
                return;
              const noticeId = `event_${event.id}_${user.id}_reminder`;
              await createNoticeOnce(noticeId, {
                userId: user.id,
                title: "Your next good conversation is coming up",
                body: `${data.title} starts soon at ${data.location}.`,
                kind: "event",
                targetId: event.id,
                createdAt: now.toISOString(),
                read: false,
              });
            }),
          );
        }
      }
      cursor = page.docs.at(-1);
      if (page.size < 100) break;
    }
  },
);

export const sendCommunityDigests = onSchedule(
  {
    schedule: "every 60 minutes",
    timeZone: "UTC",
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 1,
  },
  async () => {
    const db = getFirestore();
    const now = new Date();
    let feed:
      | Promise<{ channels: Doc[]; messages: Doc[]; posts: Doc[] }>
      | undefined;
    const loadFeed = () =>
      (feed ||= Promise.all([
        db.collection("channels").limit(1000).get(),
        db
          .collection("messages")
          .where(
            "createdAt",
            ">=",
            new Date(now.getTime() - 7 * 86_400_000).toISOString(),
          )
          .orderBy("createdAt", "desc")
          .limit(1000)
          .get(),
        db
          .collection("posts")
          .where(
            "createdAt",
            ">=",
            new Date(now.getTime() - 7 * 86_400_000).toISOString(),
          )
          .orderBy("createdAt", "desc")
          .limit(1000)
          .get(),
      ]).then(([channels, messages, posts]) => ({
        channels: channels.docs.map((doc) => doc.data()),
        messages: messages.docs.map((doc) => doc.data()),
        posts: posts.docs.map((doc) => doc.data()),
      })));
    let cursor: QueryDocumentSnapshot | undefined;
    for (;;) {
      let query = db.collection("users").orderBy("__name__").limit(100);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      if (page.empty) break;
      for (let offset = 0; offset < page.docs.length; offset += 10)
        await Promise.all(
          page.docs.slice(offset, offset + 10).map(async (user) => {
            if (user.get("disabled") || user.get("deletionPending")) return;
            const prefs = user.get("preferences") || {};
            const slot = digestSlot(prefs, now);
            if (!slot) return;
            const noticeId = `digest_${user.id}_${slot}`;
            // Check before loading the bounded shared highlights snapshot on a retry.
            if ((await db.doc(`notifications/${noticeId}`).get()).exists)
              return;
            const { channels, messages, posts } = await loadFeed();
            const content = digestContent(
              user.id,
              prefs,
              channels,
              messages,
              posts,
              now,
            );
            if (!content.messageCount && !content.postCount) return;
            const highlights = [
              content.messageCount
                ? `${content.messageCount} recent messages in topics you follow`
                : "",
              content.postCount
                ? `${content.postCount} recent community discussions`
                : "",
            ]
              .filter(Boolean)
              .join(" and ");
            await createNoticeOnce(noticeId, {
              userId: user.id,
              title:
                prefs.digest === "weekly"
                  ? "Your weekly loop"
                  : "Your daily loop",
              body: `Recent highlights: ${highlights}. Catch up on your terms.`,
              kind: "community",
              targetId: "feed",
              createdAt: now.toISOString(),
              read: false,
            });
          }),
        );
      cursor = page.docs.at(-1);
      if (page.size < 100) break;
    }
  },
);
