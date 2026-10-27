import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { squadInviteId } from "../src/squads";
import { drainDirectRead } from "../../packages/client/src/directRead";
import { directMessageRead } from "../src/directConversations";
import type { TransactionStore } from "../src/service";
import {
  createEventReminder,
  eventChangeJobId,
  eventNoticeCurrent,
  eventReminderNotice,
} from "../src/eventChangeJobs";

/**
 * Run only against a dedicated emulator project, never production.
 * Defaults: demo-theloop-integration; functions 5019, auth 9098, Firestore 8188.
 * Start matching emulators, then set THELOOP_INTEGRATION=1 and run:
 * pnpm --filter @theloop/functions exec tsx --test test/integration.test.ts
 * All accounts and documents created here are ephemeral and cleaned up by UID/ID.
 */
const enabled = process.env.THELOOP_INTEGRATION === "1";
const projectId =
  process.env.THELOOP_INTEGRATION_PROJECT_ID || "demo-theloop-integration";
const functionsHost =
  process.env.THELOOP_INTEGRATION_FUNCTIONS_HOST || "127.0.0.1:5019";
const authHost = process.env.THELOOP_INTEGRATION_AUTH_HOST || "127.0.0.1:9098";
const firestoreHost =
  process.env.THELOOP_INTEGRATION_FIRESTORE_HOST || "127.0.0.1:8188";
type TestActor = { uid: string; token: string };
class CallableFailure extends Error {
  constructor(
    public status: string,
    message: string,
  ) {
    super(message);
  }
}

test(
  "two real emulator accounts enforce callable state transitions and Firestore privacy",
  { skip: !enabled, timeout: 300_000 },
  async (t) => {
    assert.equal(
      projectId,
      "demo-theloop-integration",
      "Integration tests are restricted to the demo-theloop-integration namespace.",
    );
    for (const host of [functionsHost, authHost, firestoreHost])
      assert.match(
        host,
        /^(127\.0\.0\.1|localhost):\d+$/,
        "Only loopback emulators are allowed.",
      );
    // These process-local overrides prevent Admin SDK traffic from reaching any cloud project.
    process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;
    const runId = randomUUID().replace(/-/g, "").slice(0, 16);
    const app = initializeApp({ projectId }, `theloop-integration-${runId}`);
    const db = getFirestore(app),
      auth = getAuth(app);
    const actors: TestActor[] = [];
    const created = new Map<string, Set<string>>();
    let sequence = 0;
    const nextId = () => `qa-${runId}-${++sequence}`;
    const remember = (collection: string, id: string) => {
      if (!created.has(collection)) created.set(collection, new Set());
      created.get(collection)!.add(id);
      return id;
    };
    const fetchJSON = async (url: string, options: RequestInit) => {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(60_000),
      });
      const body = (await response.json()) as Record<string, any>;
      return { response, body };
    };
    async function createActor(label: string): Promise<TestActor> {
      const { response, body } = await fetchJSON(
        `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: `theloop-${runId}-${label}@example.test`,
            password: `Testing-${runId}!`,
            returnSecureToken: true,
          }),
        },
      );
      assert.ok(
        response.ok && body.localId && body.idToken,
        `Emulator signup failed: ${JSON.stringify(body.error ?? { status: response.status })}`,
      );
      const actor = { uid: String(body.localId), token: String(body.idToken) };
      actors.push(actor);
      await callable(actor, "bootstrap", { name: `Integration ${label}` });
      return actor;
    }
    async function callable(
      actor: TestActor,
      name: string,
      data: unknown,
    ): Promise<Record<string, any>> {
      const { response, body } = await fetchJSON(
        `http://${functionsHost}/${projectId}/us-central1/${name}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${actor.token}`,
          },
          body: JSON.stringify({ data }),
        },
      );
      if (body.error)
        throw new CallableFailure(
          String(body.error.status),
          String(body.error.message),
        );
      assert.ok(
        response.ok,
        `Callable ${name} failed: ${JSON.stringify(body)}`,
      );
      return body.result ?? body.data ?? body;
    }
    const command = (
      actor: TestActor,
      command: Record<string, unknown>,
      requestId = nextId(),
    ) => callable(actor, "executeCommand", { command, requestId });
    const denied = async (
      operation: Promise<unknown>,
      statuses = ["PERMISSION_DENIED"],
    ) =>
      assert.rejects(
        operation,
        (error) =>
          error instanceof CallableFailure && statuses.includes(error.status),
      );
    const readDocument = (actor: TestActor, path: string) =>
      fetchJSON(
        `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${path}`,
        { headers: { Authorization: `Bearer ${actor.token}` } },
      );
    const eventTransaction = <T>(
      work: (store: TransactionStore) => Promise<T>,
    ) =>
      db.runTransaction(async (tx) => {
        const pending = new Map<string, Record<string, any> | null>();
        const store: TransactionStore = {
          get: async (path) => {
            if (pending.has(path)) return pending.get(path) || undefined;
            const snap = await tx.get(db.doc(path));
            return snap.exists ? snap.data() : undefined;
          },
          find: async () => {
            throw new Error(
              "Event integration transaction does not query collections.",
            );
          },
          set: (path, value) => {
            pending.set(path, value);
          },
          remove: (path) => {
            pending.set(path, null);
          },
        };
        const result = await work(store);
        for (const [path, value] of pending)
          if (value) tx.set(db.doc(path), value);
          else tx.delete(db.doc(path));
        return result;
      });
    let alice: TestActor, bob: TestActor;
    try {
      // Load only this repository's rules into the explicitly isolated test namespace.
      // No database-wide clear is used, including on shared emulator hosts.
      const rules = await readFile(
        resolve(__dirname, "../../firestore.rules"),
        "utf8",
      );
      const rulesResponse = await fetch(
        `http://${firestoreHost}/emulator/v1/projects/${projectId}:securityRules`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rules: { files: [{ content: rules }] } }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      assert.ok(
        rulesResponse.ok,
        `Could not install isolated test rules: ${rulesResponse.status}`,
      );
      alice = await createActor("alice");
      bob = await createActor("bob");
      await db.doc(`users/${alice.uid}`).update({ role: "admin" });
      const tomorrow = new Date(Date.now() + 86_400_000)
        .toISOString()
        .slice(0, 10);
      const dayAfter = new Date(Date.now() + 172_800_000)
        .toISOString()
        .slice(0, 10);
      const conference = remember(
        "conferences",
        (
          await command(alice, {
            type: "conference.create",
            conference: {
              name: `Integration ${runId}`,
              shortName: "QA",
              city: "Test city",
              startDate: tomorrow,
              endDate: dayAfter,
              description: "Ephemeral integration fixture.",
              tagline: "Testing only",
            },
          })
        ).id,
      );
      const channel = remember(
        "channels",
        (
          await command(alice, {
            type: "channel.create",
            channel: {
              conferenceId: conference,
              name: `qa-${runId}`,
              description: "Private integration fixture.",
              visibility: "private",
              topics: ["General"],
              memberIds: [],
            },
          })
        ).id,
      );
      const firstMessage = remember(
        "messages",
        (
          await command(alice, {
            type: "message.send",
            channelId: channel,
            topic: "General",
            body: "An ephemeral private conversation.",
          })
        ).id,
      );

      await t.test(
        "private channel membership is enforced by both callable and direct reads",
        async () => {
          await denied(
            command(bob, {
              type: "message.send",
              channelId: channel,
              topic: "General",
              body: "Not a member yet.",
            }),
          );
          await denied(
            command(bob, {
              type: "message.react",
              messageId: firstMessage,
              emoji: "🖤",
            }),
          );
          assert.equal(
            (await readDocument(bob, `messages/${firstMessage}`)).response
              .status,
            403,
          );
          await command(alice, {
            type: "channel.member",
            channelId: channel,
            userId: bob.uid,
            add: true,
          });
          assert.equal(
            (await readDocument(bob, `messages/${firstMessage}`)).response
              .status,
            200,
          );
        },
      );

      await t.test("moderator pins persist through the real callable and reject ordinary members", async () => {
        await denied(command(bob, { type: "message.pin", channelId: channel, messageId: firstMessage, pinned: true }));
        const pinRequest = remember("moderationAudit", nextId());
        await command(alice, { type: "message.pin", channelId: channel, messageId: firstMessage, pinned: true }, pinRequest);
        assert.deepEqual((await db.doc(`channels/${channel}`).get()).data()?.pinnedMessageIds, [firstMessage]);
        assert.equal((await db.doc(`moderationAudit/${pinRequest}`).get()).data()?.action, "message.pin");
        await command(alice, { type: "message.pin", channelId: channel, messageId: firstMessage, pinned: false }, remember("moderationAudit", nextId()));
        assert.deepEqual((await db.doc(`channels/${channel}`).get()).data()?.pinnedMessageIds, []);
        for (const actor of [alice, bob]) await db.doc(`users/${actor.uid}/system/rate`).delete();
      });

      await t.test(
        "sending and replying never erase an explicit topic mute; retries are idempotent",
        async () => {
          await command(bob, {
            type: "subscription.set",
            targetId: `${channel}:General`,
            value: "muted",
          });
          const requestId = nextId(),
            payload = {
              type: "message.send",
              channelId: channel,
              topic: "General",
              body: "A reply with a stable request ID.",
              replyTo: firstMessage,
            };
          remember("messages", (await command(bob, payload, requestId)).id);
          assert.equal(
            (await command(bob, payload, requestId)).duplicate,
            true,
          );
          assert.equal(
            (await db.doc(`users/${bob.uid}`).get()).get(
              "preferences.subscriptions",
            )[`${channel}:General`],
            "muted",
          );
          const messages = await db
            .collection("messages")
            .where("authorId", "==", bob.uid)
            .get();
          assert.equal(
            messages.docs.filter((doc) => doc.get("body") === payload.body)
              .length,
            1,
          );
          await denied(
            command(bob, {
              type: "message.send",
              channelId: channel,
              topic: "Unregistered topic",
              body: "Cannot bypass topic creation.",
            }),
            ["INVALID_ARGUMENT", "FAILED_PRECONDITION"],
          );
        },
      );

        await t.test("real callable topic reads preserve unrelated markers and explicit mutes", async () => {
          for (const actor of [alice, bob]) await db.doc(`users/${actor.uid}/system/rate`).delete();
          await command(alice, { type: "topic.create", channelId: channel, name: "Read scope check" });
          await command(bob, { type: "channel.read", channelId: channel, topic: "Read scope check" });
          let prefs = (await db.doc(`users/${bob.uid}`).get()).data()!.preferences;
          assert.equal(typeof prefs.readChannels[`${channel}:Read scope check`], "string");
          assert.equal(prefs.readChannels[`${channel}:General`], undefined);
          assert.equal(prefs.readChannels[channel], undefined);
          await command(bob, { type: "channel.read", channelId: channel, visibleTopics: true });
          prefs = (await db.doc(`users/${bob.uid}`).get()).data()!.preferences;
          assert.equal(prefs.readChannels[`${channel}:General`], undefined);
          assert.equal(prefs.subscriptions[`${channel}:General`], "muted");
          await denied(command(bob, { type: "channel.read", channelId: channel, topic: "Missing topic" }), ["INVALID_ARGUMENT"]);
          await command(bob, { type: "channel.read", channelId: channel });
          assert.equal(typeof (await db.doc(`users/${bob.uid}`).get()).data()!.preferences.readChannels[channel], "string");
          for (const actor of [alice, bob]) await db.doc(`users/${actor.uid}/system/rate`).delete();
        });

      await t.test(
        "profile authority and private profile grants survive the full connection lifecycle",
        async () => {
          assert.equal(
            (await readDocument(bob, `users/${bob.uid}`)).response.status,
            200,
          );
          assert.equal(
            (await readDocument(bob, `users/${alice.uid}`)).response.status,
            403,
          );
          const forgedRole = await fetchJSON(
            `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/users/${bob.uid}?updateMask.fieldPaths=role`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${bob.token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                fields: { role: { stringValue: "admin" } },
              }),
            },
          );
          assert.equal(
            forgedRole.response.status,
            403,
            "an owner cannot directly grant their account a role",
          );
          const previous = (await db.doc(`profiles/${bob.uid}`).get()).get(
            "trust",
          );
          await denied(
            command(bob, {
              type: "profile.update",
              profile: { trust: { score: 100 }, verified: true, role: "admin" },
            }),
            ["INVALID_ARGUMENT", "PERMISSION_DENIED"],
          );
          assert.deepEqual(
            (await db.doc(`profiles/${bob.uid}`).get()).get("trust"),
            previous,
          );
          await command(bob, {
            type: "profile.update",
            profile: { visibility: "connections" },
          });
          assert.equal(
            (await readDocument(alice, `profiles/${bob.uid}`)).response.status,
            403,
          );
          const connection = remember(
            "connections",
            (
              await command(alice, {
                type: "connection.request",
                userId: bob.uid,
              })
            ).id,
          );
          await denied(
            command(alice, {
              type: "connection.respond",
              connectionId: connection,
              accept: true,
            }),
          );
          await command(bob, {
            type: "connection.respond",
            connectionId: connection,
            accept: true,
          });
          assert.equal(
            (await readDocument(alice, `profiles/${bob.uid}`)).response.status,
            200,
          );
        },
      );

      await t.test(
        "authoritative follows count a stable retry once and use directional edges",
        async () => {
          const requestId = nextId();
          await command(
            alice,
            { type: "profile.follow", userId: bob.uid },
            requestId,
          );
          assert.equal(
            (
              await command(
                alice,
                { type: "profile.follow", userId: bob.uid },
                requestId,
              )
            ).duplicate,
            true,
          );
          await command(bob, { type: "profile.follow", userId: alice.uid });
          const aliceEdge = `${alice.uid}~${bob.uid}`,
            bobEdge = `${bob.uid}~${alice.uid}`;
          remember("follows", aliceEdge);
          remember("follows", bobEdge);
          assert.ok((await db.doc(`follows/${aliceEdge}`).get()).exists);
          assert.ok((await db.doc(`follows/${bobEdge}`).get()).exists);
          const aliceProfile = await db.doc(`profiles/${alice.uid}`).get(),
            bobProfile = await db.doc(`profiles/${bob.uid}`).get();
          assert.equal(aliceProfile.get("followingCount"), 1);
          assert.equal(aliceProfile.get("followerCount"), 1);
          assert.equal(bobProfile.get("followingCount"), 1);
          assert.equal(bobProfile.get("followerCount"), 1);
        },
      );

      await t.test(
        "DM privacy follows recipient policy and receipts prevent duplicate sends",
        async () => {
          const requestId = nextId(),
            payload = {
              type: "dm.send",
              userId: bob.uid,
              body: "A private integration hello.",
            };
          remember(
            "directMessages",
            (await command(alice, payload, requestId)).id,
          );
          assert.equal(
            (await command(alice, payload, requestId)).duplicate,
            true,
          );
          await command(bob, {
            type: "preferences.update",
            preferences: { dmPolicy: "nobody" },
          });
          await denied(
            command(alice, { ...payload, body: "Recipient opted out." }),
          );
          await command(bob, {
            type: "preferences.update",
            preferences: { dmPolicy: "connections" },
          });
        },
      );

      await t.test(
        "RSVP capacity and FIFO promotion are authoritative across accounts",
        async () => {
          const startAt = new Date(Date.now() + 3_600_000).toISOString(),
            endAt = new Date(Date.now() + 7_200_000).toISOString();
          const event = remember(
            "events",
            (
              await command(alice, {
                type: "event.create",
                event: {
                  conferenceId: conference,
                  title: `QA event ${runId}`,
                  description: "Temporary integration plan.",
                  startAt,
                  endAt,
                  timezone: "UTC",
                  location: "Emulator only",
                  kind: "meetup",
                  capacity: 1,
                  tags: ["Testing"],
                },
              })
            ).id,
          );
          const requestId = nextId();
          await command(bob, { type: "event.rsvp", eventId: event }, requestId);
          assert.equal(
            (
              await command(
                bob,
                { type: "event.rsvp", eventId: event },
                requestId,
              )
            ).duplicate,
            true,
          );
          assert.deepEqual(
            (await db.doc(`events/${event}`).get()).get("waitlistIds"),
            [bob.uid],
          );
          await command(alice, { type: "event.rsvp", eventId: event });
          const promoted = await db.doc(`events/${event}`).get();
          assert.deepEqual(promoted.get("attendeeIds"), [bob.uid]);
          assert.deepEqual(promoted.get("waitlistIds"), []);
          await command(alice, {
            type: "event.checkin",
            eventId: event,
            userId: bob.uid,
          });
          await denied(
            command(alice, {
              type: "event.checkin",
              eventId: event,
              userId: bob.uid,
            }),
            ["ALREADY_EXISTS"],
          );
        },
      );

      await t.test(
        "communities require membership, repeated votes toggle once, and only moderators review reports",
        async () => {
          const community = remember(
            "communities",
            (
              await command(alice, {
                type: "community.create",
                name: `QA ${runId}`,
                description: "Temporary integration circle.",
              })
            ).id,
          );
          await denied(
            command(bob, {
              type: "post.create",
              communityId: community,
              title: "Not joined",
              body: "Join first.",
              kind: "discussion",
            }),
          );
          await command(bob, {
            type: "community.join",
            communityId: community,
          });
          const post = remember(
            "posts",
            (
              await command(bob, {
                type: "post.create",
                communityId: community,
                title: "A temporary conversation",
                body: "This content only exists for integration verification.",
                kind: "discussion",
              })
            ).id,
          );
          await command(alice, { type: "post.vote", postId: post, value: 1 });
          await command(alice, { type: "post.vote", postId: post, value: 1 });
          assert.equal(
            (await db.doc(`posts/${post}`).get()).get("votes")[alice.uid],
            undefined,
          );
          const alicePost = remember(
            "posts",
            (
              await command(alice, {
                type: "post.create",
                communityId: community,
                title: "Alice's original post",
                body: "Original author text must not be copied into Bob's contribution export.",
                kind: "discussion",
              })
            ).id,
          );
          await command(alice, {
            type: "post.comment",
            postId: alicePost,
            body: "Alice's separate comment stays out of Bob's export.",
          });
          await command(bob, {
            type: "post.comment",
            postId: alicePost,
            body: "Bob's own contribution is exportable.",
          });
          await command(bob, {
            type: "post.vote",
            postId: alicePost,
            value: 1,
          });
          assert.ok(
            (await db.doc(`posts/${alicePost}`).get())
              .get("contributorIds")
              .includes(bob.uid),
          );
          const contributionExport = await callable(bob, "exportAccount", {
            collection: "contributions",
          });
          const exportedContribution = contributionExport.records.find(
            (record: Record<string, unknown>) => record.postId === alicePost,
          );
          assert.ok(
            exportedContribution,
            "server-maintained contributor index finds Bob's activity",
          );
          assert.equal(exportedContribution.vote, 1);
          assert.deepEqual(
            exportedContribution.comments.map(
              (comment: Record<string, unknown>) => comment.body,
            ),
            ["Bob's own contribution is exportable."],
          );
          assert.equal(exportedContribution.body, undefined);
          assert.equal(exportedContribution.title, undefined);
          assert.ok(
            !JSON.stringify(exportedContribution).includes(
              "Alice's separate comment",
            ),
          );
          const report = remember(
            "reports",
            (
              await command(bob, {
                type: "report.create",
                targetId: firstMessage,
                targetType: "message",
                reason:
                  "An integration report to verify moderation permissions.",
              })
            ).id,
          );
          assert.equal(
            (await readDocument(bob, `reports/${report}`)).response.status,
            200,
          );
          await denied(
            command(bob, {
              type: "report.review",
              reportId: report,
              outcome: "dismiss",
              note: "Not a moderator.",
            }),
          );
          await command(alice, {
            type: "report.review",
            reportId: report,
            outcome: "dismiss",
            note: "Integration fixture reviewed.",
          });
          assert.equal(
            (await db.doc(`reports/${report}`).get()).get("status"),
            "reviewed",
          );
        },
      );

      await t.test(
        "scoped onboarding replaces only displayed follows and leaves additive completion unchanged",
        async () => {
          const publicChannels: string[] = [];
          for (const suffix of ["old", "new", "outside"])
            publicChannels.push(
              remember(
                "channels",
                (
                  await command(alice, {
                    type: "channel.create",
                    channel: {
                      conferenceId: conference,
                      name: `qa-${runId}-${suffix}`,
                      description: "Scoped onboarding fixture.",
                      visibility: "public",
                      topics: ["General"],
                    },
                  })
                ).id,
              ),
            );
          const [oldChannel, newChannel, outsideChannel] = publicChannels;
          for (const targetId of [oldChannel, outsideChannel])
            await command(bob, {
              type: "subscription.set",
              targetId,
              value: "following",
            });
          await command(bob, {
            type: "onboarding.complete",
            interests: ["Technology"],
            channelIds: [newChannel],
            replaceChannels: true,
            channelScopeIds: [oldChannel, newChannel],
          });
          const subscriptions = (await db.doc(`users/${bob.uid}`).get()).get(
            "preferences.subscriptions",
          );
          assert.equal(subscriptions[oldChannel], "muted");
          assert.equal(subscriptions[newChannel], "following");
          assert.equal(subscriptions[outsideChannel], "following");
          assert.deepEqual(
            await Promise.all(
              publicChannels.map(async (id) =>
                (await db.doc(`channels/${id}`).get()).get("members"),
              ),
            ),
            [1, 2, 2],
          );
          await command(bob, {
            type: "onboarding.complete",
            interests: ["Community"],
            channelIds: [],
          });
          assert.deepEqual(
            (await db.doc(`users/${bob.uid}`).get()).get(
              "preferences.subscriptions",
            ),
            subscriptions,
          );
          const inaccessibleChannel = remember(
            "channels",
            (
              await command(alice, {
                type: "channel.create",
                channel: {
                  conferenceId: conference,
                  name: `qa-${runId}-closed`,
                  description: "Not authorized for Bob.",
                  visibility: "private",
                  topics: ["General"],
                },
              })
            ).id,
          );
          await denied(
            command(bob, {
              type: "onboarding.complete",
              interests: ["Forged"],
              channelIds: [],
              replaceChannels: true,
              channelScopeIds: [oldChannel, inaccessibleChannel],
            }),
          );
          assert.deepEqual(
            (await db.doc(`users/${bob.uid}`).get()).get(
              "preferences.subscriptions",
            ),
            subscriptions,
            "a forbidden scope rolls the whole transaction back",
          );
        },
      );

      await t.test(
        "post and reply authors retain control after leaving without allowing impersonation; orphan saves can be removed",
        async () => {
          // Reset only these ephemeral test actors' rate buckets between independent feature scenarios.
          // Rate limiting itself is covered by the deterministic service tests.
          for (const actor of [alice, bob])
            await db.doc(`users/${actor.uid}/system/rate`).delete();
          const community = remember(
            "communities",
            (
              await command(alice, {
                type: "community.create",
                name: `Author QA ${runId}`,
                description: "Ephemeral author controls.",
              })
            ).id,
          );
          await command(bob, {
            type: "community.join",
            communityId: community,
          });
          const post = remember(
            "posts",
            (
              await command(bob, {
                type: "post.create",
                communityId: community,
                title: "Original title",
                body: "Original content",
                kind: "discussion",
                url: "https://example.com",
              })
            ).id,
          );
          const aliceComment = (
            await command(alice, {
              type: "post.comment",
              postId: post,
              body: "Alice's reply remains her own.",
            })
          ).id;
          const bobComment = (
            await command(bob, {
              type: "post.comment",
              postId: post,
              body: "Bob's original reply.",
            })
          ).id;
          await denied(
            command(alice, {
              type: "post.edit",
              postId: post,
              post: { body: "A global admin cannot impersonate Bob." },
            }),
          );
          await denied(
            command(bob, {
              type: "post.edit",
              postId: post,
              post: { authorId: alice.uid },
            }),
            ["INVALID_ARGUMENT"],
          );
          await denied(
            command(bob, {
              type: "comment.delete",
              postId: post,
              commentId: aliceComment,
            }),
          );
          await denied(
            command(alice, {
              type: "comment.edit",
              postId: post,
              commentId: bobComment,
              body: "A moderator cannot rewrite another reply.",
            }),
          );
          await command(alice, { type: "post.save", postId: post });
          await command(bob, {
            type: "community.join",
            communityId: community,
          });
          await command(bob, {
            type: "post.edit",
            postId: post,
            post: {
              title: "Author corrected title",
              body: "Author corrected content",
              url: "",
            },
          });
          await command(bob, {
            type: "comment.edit",
            postId: post,
            commentId: bobComment,
            body: "Bob corrected his own reply after leaving.",
          });
          let record = (await db.doc(`posts/${post}`).get()).data()!;
          assert.equal(record.title, "Author corrected title");
          assert.equal(record.url, undefined);
          assert.ok(record.editedAt);
          assert.equal(
            record.comments.find(
              (reply: Record<string, unknown>) => reply.id === bobComment,
            ).body,
            "Bob corrected his own reply after leaving.",
          );
          assert.equal(
            record.comments.find(
              (reply: Record<string, unknown>) => reply.id === aliceComment,
            ).body,
            "Alice's reply remains her own.",
          );
          const report = remember(
            "reports",
            (
              await command(alice, {
                type: "report.create",
                targetType: "comment",
                targetId: bobComment,
                postId: post,
                reason: "Verify exact reply moderation context.",
              })
            ).id,
          );
          assert.equal(
            (await db.doc(`reports/${report}`).get()).get("snapshot.body"),
            "Bob corrected his own reply after leaving.",
          );
          assert.equal(
            (await db.doc(`reports/${report}`).get()).get("snapshot.authorId"),
            bob.uid,
          );
          const moderationRequest = remember("moderationAudit", nextId());
          await command(
            alice,
            {
              type: "report.review",
              reportId: report,
              outcome: "remove",
              note: "Remove only the reported reply.",
            },
            moderationRequest,
          );
          record = (await db.doc(`posts/${post}`).get()).data()!;
          assert.deepEqual(
            record.comments.map((reply: Record<string, unknown>) => reply.id),
            [aliceComment],
          );
          assert.equal(record.body, "Author corrected content");
          assert.equal(
            (await db.doc(`moderationAudit/${moderationRequest}`).get()).get(
              "targetType",
            ),
            "comment",
          );
          assert.ok(
            (await db.doc(`reports/${report}`).get()).get("snapshot.body"),
          );
          const deleteRequest = remember("moderationAudit", nextId());
          await command(
            bob,
            { type: "post.delete", postId: post },
            deleteRequest,
          );
          assert.equal((await db.doc(`posts/${post}`).get()).exists, false);
          await command(alice, { type: "post.save", postId: post });
          assert.ok(
            !(await db.doc(`users/${alice.uid}`).get())
              .get("preferences.savedPostIds")
              .includes(post),
          );
          await denied(command(alice, { type: "post.save", postId: post }), [
            "NOT_FOUND",
          ]);
          const audit = (
            await db.doc(`moderationAudit/${deleteRequest}`).get()
          ).data()!;
          assert.equal(audit.actorId, bob.uid);
          assert.equal(audit.authorization, "author");
          assert.equal(audit.body, undefined);
        },
      );

      await t.test(
        "private report snapshots require original access and grant moderators no broad DM reads",
        async () => {
          const outsider = await createActor("outsider");
          const dm = remember(
            "directMessages",
            (
              await command(alice, {
                type: "dm.send",
                userId: bob.uid,
                body: "Private moderation context.",
              })
            ).id,
          );
          await denied(
            command(outsider, {
              type: "report.create",
              targetType: "directMessage",
              targetId: dm,
              reason: "Cannot copy another pair's private content.",
            }),
          );
          await denied(
            command(outsider, {
              type: "report.create",
              targetType: "profile",
              targetId: bob.uid,
              reason: "Cannot snapshot a private profile.",
            }),
          );
          const report = remember(
            "reports",
            (
              await command(bob, {
                type: "report.create",
                targetType: "directMessage",
                targetId: dm,
                reason: "Review this exact private message.",
              })
            ).id,
          );
          assert.equal(
            (await db.doc(`reports/${report}`).get()).get("snapshot.body"),
            "Private moderation context.",
          );
          await db.doc(`users/${outsider.uid}`).update({ role: "moderator" });
          assert.equal(
            (await readDocument(outsider, `directMessages/${dm}`)).response
              .status,
            403,
            "a moderator cannot directly read an unreported private conversation",
          );
          assert.equal(
            (await readDocument(outsider, `reports/${report}`)).response.status,
            200,
          );
          await command(outsider, {
            type: "report.review",
            reportId: report,
            outcome: "remove",
            note: "Only the exact reported private message is removed.",
          });
          assert.equal(
            (await db.doc(`directMessages/${dm}`).get()).exists,
            false,
          );
        },
      );

      await t.test(
        "Squads require accepted invitations, capture consenting audiences, and transfer ownership without granting old history",
        async () => {
          for (const actor of [alice, bob])
            await db.doc(`users/${actor.uid}/system/rate`).delete();
          const squad = remember(
            "squads",
            (
              await command(alice, {
                type: "squad.create",
                name: "Private consent QA",
                description: "Only accepted friends, with explicit consent.",
                inviteeIds: [bob.uid],
              })
            ).id,
          );
          const invite = remember(
            "squadInvites",
            squadInviteId(squad, bob.uid),
          );
          assert.deepEqual(
            (await db.doc(`squads/${squad}`).get()).get("memberIds"),
            [alice.uid],
          );
          assert.equal(
            (await readDocument(bob, `squads/${squad}`)).response.status,
            403,
          );
          assert.equal(
            (await readDocument(bob, `squadInvites/${invite}`)).response.status,
            200,
          );
          const old = remember(
            "squadMessages",
            (
              await command(alice, {
                type: "squad.message.send",
                squadId: squad,
                body: "Before Bob consented.",
              })
            ).id,
          );
          await denied(
            command(bob, {
              type: "squad.message.send",
              squadId: squad,
              body: "Not accepted yet.",
            }),
          );
          await command(bob, {
            type: "squad.respond",
            inviteId: invite,
            accept: true,
          });
          assert.equal(
            (await readDocument(bob, `squads/${squad}`)).response.status,
            200,
          );
          assert.equal(
            (await readDocument(bob, `squadMessages/${old}`)).response.status,
            403,
          );
          const message = remember(
            "squadMessages",
            (
              await command(alice, {
                type: "squad.message.send",
                squadId: squad,
                body: "Shared only after acceptance.",
              })
            ).id,
          );
          assert.equal(
            (await readDocument(bob, `squadMessages/${message}`)).response
              .status,
            200,
          );
          assert.deepEqual(
            (await db.doc(`squadMessages/${message}`).get()).get("audienceIds"),
            [alice.uid, bob.uid],
          );
          await denied(
            command(bob, {
              type: "squad.message.send",
              squadId: squad,
              body: "Cannot forge a recipient.",
              audienceIds: [actors[2].uid],
            }),
            ["INVALID_ARGUMENT"],
          );
          await command(bob, {
            type: "squad.mute",
            squadId: squad,
            muted: true,
          });
          const noticeCount = (
            await db
              .collection("notifications")
              .where("userId", "==", bob.uid)
              .get()
          ).docs.filter((notice) => notice.get("targetId") === squad).length;
          remember(
            "squadMessages",
            (
              await command(alice, {
                type: "squad.message.send",
                squadId: squad,
                body: "Delivered quietly.",
              })
            ).id,
          );
          assert.equal(
            (
              await db
                .collection("notifications")
                .where("userId", "==", bob.uid)
                .get()
            ).docs.filter((notice) => notice.get("targetId") === squad).length,
            noticeCount,
          );
          const own = remember(
            "squadMessages",
            (
              await command(bob, {
                type: "squad.message.send",
                squadId: squad,
                body: "Bob's exportable private contribution.",
              })
            ).id,
          );
          const exported = await callable(bob, "exportAccount", {
            collection: "squadMessages",
          });
          assert.ok(
            exported.records.some(
              (record: Record<string, unknown>) => record.id === own,
            ),
          );
          assert.ok(
            exported.records.every(
              (record: Record<string, unknown>) => record.authorId === bob.uid,
            ),
          );
          const moderator = actors[2];
          assert.equal(
            (await readDocument(moderator, `squadMessages/${message}`)).response
              .status,
            403,
          );
          await denied(
            command(moderator, {
              type: "report.create",
              targetType: "squadMessage",
              targetId: message,
              reason: "Role cannot copy a private Squad message.",
            }),
          );
          const report = remember(
            "reports",
            (
              await command(bob, {
                type: "report.create",
                targetType: "squadMessage",
                targetId: message,
                reason: "Review the exact consenting message.",
              })
            ).id,
          );
          assert.equal(
            (await db.doc(`reports/${report}`).get()).get("snapshot.body"),
            "Shared only after acceptance.",
          );
          assert.equal(
            (await readDocument(moderator, `reports/${report}`)).response
              .status,
            200,
          );
          await command(moderator, {
            type: "report.review",
            reportId: report,
            outcome: "dismiss",
            note: "Snapshot review does not unlock private history.",
          });
          await command(alice, {
            type: "squad.transfer",
            squadId: squad,
            userId: bob.uid,
          });
          await denied(
            command(bob, { type: "squad.message.delete", messageId: old }),
          );
          await command(bob, { type: "squad.leave", squadId: squad });
          assert.equal(
            (await db.doc(`squads/${squad}`).get()).get("ownerId"),
            alice.uid,
          );
          assert.equal(
            (await readDocument(bob, `squadMessages/${message}`)).response
              .status,
            403,
          );
          const deleteRequest = remember("moderationAudit", nextId());
          await command(
            bob,
            { type: "squad.message.delete", messageId: own },
            deleteRequest,
          );
          assert.equal(
            (await db.doc(`squadMessages/${own}`).get()).exists,
            false,
          );
          await command(alice, { type: "squad.leave", squadId: squad });
          assert.equal(
            (await db.doc(`squads/${squad}`).get()).get("archived"),
            true,
          );
          assert.deepEqual(
            (await db.doc(`squads/${squad}`).get()).get("memberIds"),
            [],
          );
        },
      );

      await t.test(
        "DM controls preserve trusted minimal identities and metadata without granting private profiles",
        async () => {
          const reader = await createActor("dm-reader");
          await command(reader, {
            type: "profile.update",
            profile: { visibility: "connections" },
          });
          await command(reader, {
            type: "preferences.update",
            preferences: { dmPolicy: "everyone" },
          });
          const message = remember(
            "directMessages",
            (
              await command(alice, {
                type: "dm.send",
                userId: reader.uid,
                body: "A message to a new person.",
              })
            ).id,
          );
          const before = (
            await db.doc(`directMessages/${message}`).get()
          ).data()!;
          assert.equal(before.fromName, "Integration alice");
          assert.equal(before.toName, "Integration dm-reader");
          assert.equal(before.fromInitials, "IA");
          assert.equal(before.headline, undefined);
          assert.equal(
            (await readDocument(alice, `profiles/${reader.uid}`)).response
              .status,
            403,
            "participation names do not grant a private professional profile",
          );
          await denied(
            command(reader, {
              type: "dm.edit",
              messageId: message,
              body: "Not mine",
            }),
          );
          await denied(
            command(actors[2], { type: "dm.delete", messageId: message }),
          );
          await denied(
            command(alice, {
              type: "dm.edit",
              messageId: message,
              body: "Forged",
              toId: bob.uid,
            }),
            ["INVALID_ARGUMENT"],
          );
          await command(reader, { type: "dm.read", userId: alice.uid });
          await command(alice, {
            type: "dm.edit",
            messageId: message,
            body: "Corrected by the sender.",
          });
          const edited = (
            await db.doc(`directMessages/${message}`).get()
          ).data()!;
          for (const field of [
            "fromId",
            "toId",
            "fromName",
            "fromInitials",
            "toName",
            "toInitials",
            "participantIds",
            "conversationId",
            "createdAt",
          ])
            assert.deepEqual(edited[field], before[field]);
          assert.equal(
            directMessageRead(
              edited,
              (
                await db
                  .doc(`directConversations/${edited.conversationId}`)
                  .get()
              ).data(),
            ),
            true,
          );
          assert.ok(edited.editedAt);
          await command(reader, {
            type: "dm.mute",
            userId: alice.uid,
            muted: true,
          });
          const noticeCount = (
            await db
              .collection("notifications")
              .where("userId", "==", reader.uid)
              .get()
          ).size;
          const quiet = remember(
            "directMessages",
            (
              await command(alice, {
                type: "dm.send",
                userId: reader.uid,
                body: "Quiet delivery still reaches history.",
              })
            ).id,
          );
          assert.ok((await db.doc(`directMessages/${quiet}`).get()).exists);
          assert.equal(
            (
              await db
                .collection("notifications")
                .where("userId", "==", reader.uid)
                .get()
            ).size,
            noticeCount,
          );
          await command(reader, { type: "profile.block", userId: alice.uid });
          await denied(
            command(alice, {
              type: "dm.edit",
              messageId: message,
              body: "No new text through a block.",
            }),
          );
          const deletion = remember("moderationAudit", nextId());
          await command(
            alice,
            { type: "dm.delete", messageId: message },
            deletion,
          );
          assert.equal(
            (await db.doc(`directMessages/${message}`).get()).exists,
            false,
          );
        },
      );

      await t.test(
        "one real client read call covers 1205 sequenced messages past 205 unrelated messages",
        async () => {
          const reader = await createActor("dm-scale");
          const selected: string[] = [],
            unrelated: string[] = [],
            batches = [db.batch()];
          let writes = 0;
          const conversation = (a: string, b: string) =>
            [a, b].sort().join("~");
          for (let n = 0; n < 1205; n++) {
            for (const [sender, ids] of [
              [actors[2], unrelated],
              [alice, selected],
            ] as const) {
              if (sender === actors[2] && n >= 205) continue;
              const id = remember("directMessages", nextId());
              ids.push(id);
              if (writes && writes % 400 === 0) batches.push(db.batch());
              batches.at(-1)!.set(db.doc(`directMessages/${id}`), {
                id,
                fromId: sender.uid,
                toId: reader.uid,
                participantIds: [sender.uid, reader.uid],
                conversationId: conversation(sender.uid, reader.uid),
                unreadRecipientId: reader.uid,
                body: "Disposable read-marker scale fixture.",
                createdAt: new Date().toISOString(),
                read: false,
                ...(sender === alice ? { sequence: n + 1 } : {}),
              });
              writes++;
            }
          }
          for (const batch of batches) await batch.commit();
          await db
            .doc(`directConversations/${conversation(alice.uid, reader.uid)}`)
            .set({
              id: conversation(alice.uid, reader.uid),
              participantIds: [alice.uid, reader.uid],
              memberNames: { [alice.uid]: "Sender", [reader.uid]: "Reader" },
              memberInitials: { [alice.uid]: "S", [reader.uid]: "R" },
              createdAt: new Date().toISOString(),
              lastAt: new Date().toISOString(),
              sequence: 1205,
              readAt: {},
              readThrough: {},
              unreadCounts: { [reader.uid]: 1205 },
            });
          const pages: number[] = [],
            receipts: string[] = [];
          await drainDirectRead({
            requestId: () => {
              const id = nextId();
              receipts.push(id);
              return id;
            },
            current: () => true,
            send: async (requestId) => {
              const result = await command(
                reader,
                { type: "dm.read", userId: alice.uid },
                requestId,
              );
              pages.push(result.marked);
              return result;
            },
          });
          assert.deepEqual(pages, [1205]);
          assert.equal(new Set(receipts).size, 1);
          const selectedDocs = await db.getAll(
            ...selected.map((id) => db.doc(`directMessages/${id}`)),
          );
          const unrelatedDocs = await db.getAll(
            ...unrelated.map((id) => db.doc(`directMessages/${id}`)),
          );
          const summary = (
            await db
              .doc(`directConversations/${conversation(alice.uid, reader.uid)}`)
              .get()
          ).data();
          assert.ok(
            selectedDocs.every((row) =>
              directMessageRead(row.data()!, summary),
            ),
          );
          assert.ok(unrelatedDocs.every((row) => row.get("read") === false));
        },
      );

      await t.test(
        "private conversation discovery resumes legacy pages without corrupting watermarks, counts, edits or deletion",
        async () => {
          const reader = await createActor("catalog");
          await command(reader, {
            type: "preferences.update",
            preferences: { dmPolicy: "everyone" },
          });
          const fixture = db.batch(),
            peers: string[] = [],
            sourceIds: string[] = [];
          for (let n = 0; n < 55; n++) {
            const peerId = n === 54 ? alice.uid : `catalog-peer-${runId}-${n}`;
            peers.push(peerId);
            if (peerId !== alice.uid) {
              remember("users", peerId);
              remember("profiles", peerId);
              fixture.set(db.doc(`users/${peerId}`), {
                id: peerId,
                preferences: {},
              });
              fixture.set(db.doc(`profiles/${peerId}`), {
                id: peerId,
                name: `Private member ${n}`,
                visibility: "connections",
                company: "NEVER_COPY_PROFESSIONAL_INFO",
              });
            }
            const id = remember(
              "directMessages",
              `catalog-${runId}-${String(n).padStart(3, "0")}`,
            );
            sourceIds.push(id);
            fixture.set(db.doc(`directMessages/${id}`), {
              id,
              fromId: peerId,
              toId: reader.uid,
              participantIds: [peerId, reader.uid],
              conversationId: [peerId, reader.uid].sort().join("~"),
              createdAt: "2025-01-01T00:00:00.000Z",
              body: `Legacy ${n}`,
              read: n === 51,
            });
          }
          await fixture.commit();
          const first = await callable(reader, "syncDirectConversations", {});
          assert.equal(first.complete, false);
          assert.equal(first.processed, 50);
          assert.equal(
            (await db.doc(`users/${reader.uid}`).get()).get(
              "directCatalog.complete",
            ),
            false,
          );
          await command(reader, { type: "dm.read", userId: alice.uid });
          const live = remember(
            "directMessages",
            (
              await command(alice, {
                type: "dm.send",
                userId: reader.uid,
                body: "Live during legacy discovery",
              })
            ).id,
          );
          await db.doc(`directMessages/${sourceIds[52]}`).delete();
          await db
            .doc(`directMessages/${sourceIds[53]}`)
            .update({ body: "Latest legacy edit before migration" });
          const second = await callable(reader, "syncDirectConversations", {});
          assert.equal(second.complete, true);
          assert.equal(second.processed, 55);
          assert.equal(second.cursor, null);
          const retry = await callable(reader, "syncDirectConversations", {});
          assert.deepEqual(retry, second);
          const pair = (peer: string) => [peer, reader.uid].sort().join("~");
          const summaries = await db
            .collection("directConversations")
            .where("participantIds", "array-contains", reader.uid)
            .get();
          assert.equal(
            summaries.size,
            54,
            "all historical peers are discoverable independently of a global recent-message limit",
          );
          assert.ok(
            !JSON.stringify(summaries.docs.map((row) => row.data())).includes(
              "NEVER_COPY_PROFESSIONAL_INFO",
            ),
          );
          assert.equal(
            (await db.doc(`directConversations/${pair(peers[51])}`).get()).get(
              `unreadCounts.${reader.uid}`,
            ) || 0,
            0,
          );
          assert.equal(
            (await db.doc(`directConversations/${pair(peers[50])}`).get()).get(
              `unreadCounts.${reader.uid}`,
            ),
            1,
          );
          assert.equal(
            (await db.doc(`directConversations/${pair(peers[53])}`).get()).get(
              "lastMessage.body",
            ),
            "Latest legacy edit before migration",
          );
          const aliceSummary = (
            await db.doc(`directConversations/${pair(alice.uid)}`).get()
          ).data()!;
          assert.equal(aliceSummary.unreadCounts[reader.uid], 1);
          assert.equal(
            directMessageRead(
              (await db.doc(`directMessages/${sourceIds[54]}`).get()).data()!,
              aliceSummary,
            ),
            true,
          );
          assert.equal(
            directMessageRead(
              (await db.doc(`directMessages/${live}`).get()).data()!,
              aliceSummary,
            ),
            false,
          );
          assert.equal(
            (
              await readDocument(
                actors[2],
                `directConversations/${pair(alice.uid)}`,
              )
            ).response.status,
            403,
          );
          assert.equal(
            (
              await readDocument(
                reader,
                `directConversations/${pair(alice.uid)}`,
              )
            ).response.status,
            200,
          );
          const exported = await callable(reader, "exportAccount", {
            collection: "directMessages",
          });
          assert.equal(
            exported.records.find((row: any) => row.id === sourceIds[54]).read,
            true,
          );
          assert.equal(
            exported.records.find((row: any) => row.id === live).read,
            false,
          );
          const [, racingSend] = await Promise.all([
            command(reader, { type: "dm.read", userId: alice.uid }),
            command(alice, {
              type: "dm.send",
              userId: reader.uid,
              body: "Racing a read transaction",
            }),
          ]);
          remember("directMessages", racingSend.id);
          const racedMessage = (
            await db.doc(`directMessages/${racingSend.id}`).get()
          ).data()!;
          const racedSummary = (
            await db.doc(`directConversations/${pair(alice.uid)}`).get()
          ).data()!;
          assert.equal(
            racedSummary.unreadCounts[reader.uid],
            directMessageRead(racedMessage, racedSummary) ? 0 : 1,
          );
          assert.equal(
            directMessageRead(
              (await db.doc(`directMessages/${live}`).get()).data()!,
              racedSummary,
            ),
            true,
          );
          await db.doc(`users/${reader.uid}`).update({ deletionPending: true });
          await denied(callable(reader, "syncDirectConversations", {}), [
            "FAILED_PRECONDITION",
          ]);
        },
      );

      await t.test(
        "recipient-authored history permits replies while unanswered inbound history never grants consent",
        async () => {
          const starter = await createActor("starter"),
            responder = await createActor("responder"),
            stranger = await createActor("stranger");
          await command(starter, {
            type: "preferences.update",
            preferences: { dmPolicy: "everyone" },
          });
          remember(
            "directMessages",
            (
              await command(stranger, {
                type: "dm.send",
                userId: starter.uid,
                body: "An inbound message before policy changed.",
              })
            ).id,
          );
          await command(starter, {
            type: "preferences.update",
            preferences: { dmPolicy: "nobody" },
          });
          await denied(
            command(stranger, {
              type: "dm.send",
              userId: starter.uid,
              body: "Unanswered inbound cannot bypass the new policy.",
            }),
          );
          await command(responder, {
            type: "preferences.update",
            preferences: { dmPolicy: "everyone" },
          });
          remember(
            "directMessages",
            (
              await command(starter, {
                type: "dm.send",
                userId: responder.uid,
                body: "I choose to start a conversation.",
              })
            ).id,
          );
          const reply = remember(
            "directMessages",
            (
              await command(responder, {
                type: "dm.send",
                userId: starter.uid,
                body: "A reply to your explicit outbound message.",
              })
            ).id,
          );
          assert.equal(
            (await db.doc(`directMessages/${reply}`).get()).get("fromName"),
            "Integration responder",
          );
          await command(starter, {
            type: "profile.block",
            userId: responder.uid,
          });
          await denied(
            command(responder, {
              type: "dm.send",
              userId: starter.uid,
              body: "Blocks override prior reply consent.",
            }),
          );
        },
      );

      await t.test(
        "real event edits enforce revisions and FIFO while cancellation wins races and durable critical notices",
        async () => {
          const host = await createActor("event-host");
          const startAt = new Date(Date.now() + 3600000).toISOString(),
            endAt = new Date(Date.now() + 7200000).toISOString();
          const details = {
            conferenceId: conference,
            title: `Lifecycle ${runId}`,
            description: "",
            startAt,
            endAt,
            timezone: "UTC",
            location: "Emulator only",
            kind: "meetup",
            capacity: 1,
            tags: [],
          };
          for (const patch of [
            { status: "cancelled" },
            { hostId: bob.uid },
            { startAt: "2027-02-30T12:00:00Z" },
            { startAt: "2027-02-28T12:00:00" },
          ])
            await denied(
              command(host, {
                type: "event.create",
                event: { ...details, ...patch },
              }),
              ["INVALID_ARGUMENT"],
            );
          const eventId = remember(
            "events",
            (await command(host, { type: "event.create", event: details })).id,
          );
          await command(bob, { type: "event.rsvp", eventId });
          await command(alice, { type: "event.rsvp", eventId });
          const outsider = await createActor("event-outsider");
          await db.doc(`users/${outsider.uid}`).update({ role: "moderator" });
          await denied(
            command(outsider, {
              type: "event.edit",
              eventId,
              expectedSequence: 0,
              event: { title: "Impersonation" },
            }),
          );
          await denied(
            command(outsider, {
              type: "event.cancel",
              eventId,
              expectedSequence: 0,
            }),
          );
          await denied(
            command(host, {
              type: "event.edit",
              eventId,
              expectedSequence: 0,
              event: { attendeeIds: [] },
            }),
            ["INVALID_ARGUMENT"],
          );
          await command(host, {
            type: "event.edit",
            eventId,
            expectedSequence: 0,
            event: { capacity: 2 },
          });
          let record = (await db.doc(`events/${eventId}`).get()).data()!;
          assert.deepEqual(record.attendeeIds, [host.uid, bob.uid]);
          assert.deepEqual(record.waitlistIds, [alice.uid]);
          assert.equal(record.sequence, 1);
          await denied(
            command(host, {
              type: "event.edit",
              eventId,
              expectedSequence: 0,
              event: { title: "Stale overwrite" },
            }),
            ["ABORTED"],
          );
          await Promise.all([
            command(host, {
              type: "event.edit",
              eventId,
              expectedSequence: 1,
              event: { capacity: 3 },
            }),
            command(bob, { type: "event.rsvp", eventId }),
          ]);
          record = (await db.doc(`events/${eventId}`).get()).data()!;
          assert.deepEqual(
            [...record.attendeeIds].sort(),
            [host.uid, alice.uid].sort(),
          );
          assert.deepEqual(record.waitlistIds, []);
          assert.equal(record.sequence, 2);
          await command(alice, {
            type: "preferences.update",
            preferences: { eventReminders: false },
          });
          const race = await Promise.allSettled([
            command(host, {
              type: "event.cancel",
              eventId,
              expectedSequence: 2,
              reason: "Venue unavailable",
            }),
            command(bob, { type: "event.rsvp", eventId }),
          ]);
          assert.equal(race[0].status, "fulfilled");
          if (race[1].status === "rejected")
            assert.equal(
              (race[1].reason as CallableFailure).status,
              "FAILED_PRECONDITION",
            );
          record = (await db.doc(`events/${eventId}`).get()).data()!;
          assert.equal(record.status, "cancelled");
          assert.equal(record.sequence, 3);
          assert.ok(record.attendeeIds.includes(alice.uid));
          assert.ok(record.attendeeIds.length <= 3);
          const repeated = await command(host, {
            type: "event.cancel",
            eventId,
            expectedSequence: 0,
          });
          assert.equal(repeated.unchanged, true);
          assert.equal(repeated.sequence, 3);
          await denied(command(outsider, { type: "event.rsvp", eventId }), [
            "FAILED_PRECONDITION",
          ]);
          await denied(
            command(alice, {
              type: "event.checkin",
              eventId,
              userId: host.uid,
            }),
            ["FAILED_PRECONDITION"],
          );
          const jobId = eventChangeJobId({ id: eventId, sequence: 3 });
          for (let retry = 0; retry < 100; retry++) {
            const job = await db.doc(`eventChangeJobs/${jobId}`).get();
            if (job.get("status") === "complete") break;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          assert.equal(
            (await db.doc(`eventChangeJobs/${jobId}`).get()).get("status"),
            "complete",
            "Firestore creation trigger drains the durable event outbox",
          );
          const notices = await db
            .collection("notifications")
            .where("userId", "==", alice.uid)
            .get();
          assert.ok(
            notices.docs.some(
              (notice) =>
                notice.get("targetId") === eventId &&
                notice.get("eventNoticeType") === "cancelled",
            ),
            "critical cancellation remains in-app despite reminder opt-out",
          );
          assert.equal(
            (await readDocument(alice, `eventChangeJobs/${jobId}`)).response
              .status,
            403,
          );
          assert.ok(
            (
              await callable(host, "exportAccount", {
                collection: "hostedEvents",
              })
            ).records.some((row: any) => row.id === eventId),
          );
          await command(alice, { type: "event.rsvp", eventId });
          assert.ok(
            !(await db.doc(`events/${eventId}`).get())
              .get("attendeeIds")
              .includes(alice.uid),
          );
        },
      );

      await t.test(
        "real reminder transactions reread cancellation and reschedule state while stale push eligibility is revoked",
        async () => {
          const host = await createActor("reminder-host");
          const eventId = remember(
            "events",
            (
              await command(host, {
                type: "event.create",
                event: {
                  conferenceId: conference,
                  title: `Reminder ${runId}`,
                  description: "",
                  startAt: new Date(Date.now() + 1200000).toISOString(),
                  endAt: new Date(Date.now() + 2400000).toISOString(),
                  timezone: "UTC",
                  location: "Emulator",
                  kind: "meetup",
                  capacity: 0,
                  tags: [],
                },
              })
            ).id,
          );
          assert.equal(
            await eventTransaction((store) =>
              createEventReminder(
                store,
                eventId,
                host.uid,
                new Date().toISOString(),
              ),
            ),
            true,
          );
          let record = (await db.doc(`events/${eventId}`).get()).data()!;
          const original = eventReminderNotice(
            record,
            host.uid,
            new Date().toISOString(),
          );
          assert.equal(
            await eventTransaction((store) =>
              createEventReminder(
                store,
                eventId,
                host.uid,
                new Date().toISOString(),
              ),
            ),
            false,
          );
          await command(host, {
            type: "event.edit",
            eventId,
            expectedSequence: 0,
            event: {
              startAt: new Date(Date.now() + 1500000).toISOString(),
              endAt: new Date(Date.now() + 2700000).toISOString(),
            },
          });
          assert.equal(
            await eventTransaction((store) =>
              createEventReminder(
                store,
                eventId,
                host.uid,
                new Date().toISOString(),
              ),
            ),
            true,
          );
          record = (await db.doc(`events/${eventId}`).get()).data()!;
          assert.equal(
            eventNoticeCurrent(
              original,
              record,
              host.uid,
              { preferences: {} },
              new Date().toISOString(),
            ),
            false,
          );
          const moved = eventReminderNotice(
            record,
            host.uid,
            new Date().toISOString(),
          );
          assert.notEqual(original.id, moved.id);
          await command(host, {
            type: "event.cancel",
            eventId,
            expectedSequence: 1,
          });
          assert.equal(
            await eventTransaction((store) =>
              createEventReminder(
                store,
                eventId,
                host.uid,
                new Date().toISOString(),
              ),
            ),
            false,
          );
          record = (await db.doc(`events/${eventId}`).get()).data()!;
          assert.equal(
            eventNoticeCurrent(
              moved,
              record,
              host.uid,
              { preferences: {} },
              new Date().toISOString(),
            ),
            false,
          );
        },
      );

      await t.test(
        "real account deletion removes event queue identity and check-in references without promoting a cancelled waitlist",
        async () => {
          const retiring = await createActor("retiring-event-host");
          const eventId = remember("events", nextId()),
            jobId = remember("eventChangeJobs", nextId());
          await db.doc(`events/${eventId}`).set({
            id: eventId,
            conferenceId: conference,
            hostId: retiring.uid,
            cancelledBy: retiring.uid,
            status: "cancelled",
            sequence: 1,
            title: "Cancelled privacy fixture",
            description: "",
            startAt: new Date(Date.now() + 3600000).toISOString(),
            endAt: new Date(Date.now() + 7200000).toISOString(),
            capacity: 2,
            attendeeIds: [retiring.uid, alice.uid],
            waitlistIds: [bob.uid],
          });
          await db.doc(`events/${eventId}/checkins/${retiring.uid}`).set({
            userId: retiring.uid,
            confirmedBy: alice.uid,
            createdAt: new Date().toISOString(),
          });
          await db.doc(`events/${eventId}/checkins/${alice.uid}`).set({
            userId: alice.uid,
            confirmedBy: retiring.uid,
            createdAt: new Date().toISOString(),
          });
          await db.doc(`eventChangeJobs/${jobId}`).set({
            id: jobId,
            eventId,
            sequence: 1,
            actorId: retiring.uid,
            kind: "cancelled",
            recipientIds: [retiring.uid, alice.uid, bob.uid],
            promotedIds: [retiring.uid, bob.uid],
            changedFields: ["status"],
            createdAt: new Date().toISOString(),
            cursor: 1,
            processed: 0,
            status: "pending",
          });
          remember("deletionJobs", retiring.uid);
          await callable(retiring, "deleteAccount", { confirmation: "DELETE" });
          for (let retry = 0; retry < 300; retry++) {
            const status = await db.doc(`deletionJobs/${retiring.uid}`).get();
            if (status.get("status") === "complete") break;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          assert.equal(
            (await db.doc(`deletionJobs/${retiring.uid}`).get()).get("status"),
            "complete",
            "actual Firestore account-deletion trigger completes",
          );
          assert.equal(
            (await db.doc(`users/${retiring.uid}`).get()).exists,
            false,
          );
          const retained = (await db.doc(`events/${eventId}`).get()).data()!;
          assert.equal(retained.hostId, "deleted-member");
          assert.equal(retained.cancelledBy, "deleted-member");
          assert.deepEqual(retained.attendeeIds, [alice.uid]);
          assert.deepEqual(retained.waitlistIds, [bob.uid]);
          assert.equal(
            (await db.doc(`events/${eventId}/checkins/${retiring.uid}`).get())
              .exists,
            false,
          );
          assert.equal(
            (await db.doc(`events/${eventId}/checkins/${alice.uid}`).get()).get(
              "confirmedBy",
            ),
            "deleted-member",
          );
          assert.ok(
            !JSON.stringify(
              (await db.doc(`eventChangeJobs/${jobId}`).get()).data(),
            ).includes(retiring.uid),
          );
          assert.equal(
            (
              await db
                .collection("notifications")
                .where("eventActorId", "==", retiring.uid)
                .get()
            ).size,
            0,
          );
        },
      );

      await t.test(
        "blocking revokes profile grants, both follow edges, and messages in both directions",
        async () => {
          const pendingSquad = remember(
            "squads",
            (
              await command(alice, {
                type: "squad.create",
                name: "Pending block cleanup",
                inviteeIds: [bob.uid],
              })
            ).id,
          );
          const pendingInvite = remember(
            "squadInvites",
            squadInviteId(pendingSquad, bob.uid),
          );
          await command(alice, { type: "profile.block", userId: bob.uid });
          assert.equal(
            (await db.doc(`squadInvites/${pendingInvite}`).get()).get("status"),
            "revoked",
          );
          assert.deepEqual(
            (await db.doc(`squads/${pendingSquad}`).get()).get(
              "pendingInviteeIds",
            ),
            [],
          );
          assert.equal(
            (await readDocument(alice, `profiles/${bob.uid}`)).response.status,
            403,
          );
          await denied(
            command(alice, {
              type: "dm.send",
              userId: bob.uid,
              body: "Blocked interaction.",
            }),
          );
          await denied(
            command(bob, {
              type: "dm.send",
              userId: alice.uid,
              body: "Blocked interaction in reverse.",
            }),
          );
          assert.ok(
            !(await db.doc(`follows/${alice.uid}~${bob.uid}`).get()).exists,
          );
          assert.ok(
            !(await db.doc(`follows/${bob.uid}~${alice.uid}`).get()).exists,
          );
          const aliceProfile = await db.doc(`profiles/${alice.uid}`).get(),
            bobProfile = await db.doc(`profiles/${bob.uid}`).get();
          assert.equal(aliceProfile.get("followingCount"), 0);
          assert.equal(aliceProfile.get("followerCount"), 0);
          assert.equal(bobProfile.get("followingCount"), 0);
          assert.equal(bobProfile.get("followerCount"), 0);
        },
      );
    } finally {
      // No database-wide clear: cleanup is restricted to this run's IDs and ephemeral UIDs.
      for (const [collection, ids] of created) {
        if (collection === "directMessages") {
          const rows = [...ids];
          for (let offset = 0; offset < rows.length; offset += 200) {
            const batch = db.batch();
            for (const id of rows.slice(offset, offset + 200))
              batch.delete(db.doc(`${collection}/${id}`));
            await batch.commit();
          }
        } else
          for (const id of ids)
            await db.recursiveDelete(db.doc(`${collection}/${id}`));
      }
      for (const actor of actors) {
        for (const [collection, field, operator] of [
          ["notifications", "userId", "=="],
          ["reports", "reporterId", "=="],
          ["follows", "participantIds", "array-contains"],
          ["connections", "participantIds", "array-contains"],
          ["eventChangeJobs", "actorId", "=="],
          ["directConversations", "participantIds", "array-contains"],
        ] as const) {
          const rows = await db
            .collection(collection)
            .where(field, operator, actor.uid)
            .get();
          for (const row of rows.docs) await row.ref.delete();
        }
        for (const path of [`profileAccess/${actor.uid}`, `users/${actor.uid}`])
          await db.recursiveDelete(db.doc(path));
        await db.doc(`profiles/${actor.uid}`).delete();
        await db.doc(`trustSignals/${actor.uid}`).delete();
        await auth.deleteUser(actor.uid).catch((error) => {
          if (error.code !== "auth/user-not-found") throw error;
        });
      }
      await deleteApp(app);
    }
  },
);
