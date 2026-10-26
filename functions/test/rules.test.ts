import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

let env: RulesTestEnvironment;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST)
    throw new Error(
      "Run with pnpm test:rules so the Firestore emulator is isolated from production.",
    );
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT || "demo-theloop",
    firestore: {
      host,
      port: Number(port),
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
    },
  });
});
after(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const rows: Record<string, unknown> = {
      "users/alice": { id: "alice", preferences: { blockedIds: [] } },
      "users/bob": { id: "bob", preferences: { blockedIds: [] } },
      "users/eve": { id: "eve", preferences: { blockedIds: [] } },
      "users/mod": { id: "mod", role: "moderator", preferences: {} },
      "users/disabled": { id: "disabled", disabled: true, preferences: {} },
      "profiles/alice": {
        id: "alice",
        visibility: "public",
        name: "Alice",
        trust: { score: 30 },
      },
      "profiles/bob": {
        id: "bob",
        visibility: "connections",
        name: "Bob",
        trust: { score: 30 },
      },
      "profileAccess/bob/members/alice": { userId: "alice" },
      "conferences/afrotech": { id: "afrotech", name: "Community" },
      "channels/public-room": { id: "public-room", visibility: "public" },
      "channels/private-room": {
        id: "private-room",
        visibility: "private",
        memberIds: ["alice"],
      },
      "messages/public-message": {
        id: "public-message",
        channelId: "public-room",
        authorId: "bob",
        body: "Public chat",
      },
      "messages/private-message": {
        id: "private-message",
        channelId: "private-room",
        authorId: "alice",
        body: "Private chat",
      },
      "communities/builders": { id: "builders", moderatorIds: ["mod"] },
      "posts/discussion": {
        id: "discussion",
        authorId: "alice",
        communityId: "builders",
        votes: {},
      },
      "events/coffee": { id: "coffee", attendeeIds: ["alice"], capacity: 1 },
      "connections/alice~bob": {
        id: "alice~bob",
        fromId: "alice",
        toId: "bob",
        participantIds: ["alice", "bob"],
        status: "accepted",
      },
      "directMessages/alice-bob": {
        id: "alice-bob",
        fromId: "alice",
        toId: "bob",
        participantIds: ["alice", "bob"],
        body: "Private DM",
      },
      "notifications/alice-notice": {
        id: "alice-notice",
        userId: "alice",
        title: "Your notice",
      },
      "notifications/bob-notice": {
        id: "bob-notice",
        userId: "bob",
        title: "Private notice",
      },
      "reports/report": {
        id: "report",
        reporterId: "alice",
        reason: "Private report",
      },
      "trustSignals/alice": { emailVerified: true },
      "users/alice/system/rate": { count: 1 },
      "users/alice/pushTokens/token": { token: "ExpoPushToken[test]" },
      "users/alice/requests/request": { result: {} },
      "deletionJobs/alice": { userId: "alice", status: "pending" },
    };
    await Promise.all(
      Object.entries(rows).map(([path, data]) => setDoc(doc(db, path), data)),
    );
  });
});

test("anonymous and disabled accounts cannot read community content", async () => {
  for (const context of [
    env.unauthenticatedContext(),
    env.authenticatedContext("disabled"),
  ])
    await assertFails(getDoc(doc(context.firestore(), "conferences/afrotech")));
  await assertSucceeds(
    getDoc(
      doc(
        env.authenticatedContext("alice").firestore(),
        "conferences/afrotech",
      ),
    ),
  );
});
test("private preferences belong only to their owner", async () => {
  const alice = env.authenticatedContext("alice").firestore();
  await assertSucceeds(getDoc(doc(alice, "users/alice")));
  await assertFails(getDoc(doc(alice, "users/bob")));
  await assertFails(updateDoc(doc(alice, "users/alice"), { role: "admin" }));
});
test("public profile queries are allowed but collection-wide private profile queries fail", async () => {
  const eve = env.authenticatedContext("eve").firestore();
  const publicProfiles = await assertSucceeds(
    getDocs(
      query(collection(eve, "profiles"), where("visibility", "==", "public")),
    ),
  );
  assert.equal(publicProfiles.size, 1);
  await assertFails(getDocs(collection(eve, "profiles")));
  await assertFails(getDoc(doc(eve, "profiles/bob")));
  await assertSucceeds(
    getDoc(doc(env.authenticatedContext("alice").firestore(), "profiles/bob")),
  );
  await assertSucceeds(
    getDoc(doc(env.authenticatedContext("bob").firestore(), "profiles/bob")),
  );
});
test("private channel content requires membership and a bounded channel query", async () => {
  const bob = env.authenticatedContext("bob").firestore();
  const alice = env.authenticatedContext("alice").firestore();
  await assertSucceeds(
    getDocs(
      query(collection(bob, "channels"), where("visibility", "==", "public")),
    ),
  );
  await assertSucceeds(
    getDocs(
      query(
        collection(bob, "messages"),
        where("channelId", "==", "public-room"),
      ),
    ),
  );
  await assertFails(getDocs(collection(bob, "messages")));
  await assertFails(getDoc(doc(bob, "messages/private-message")));
  await assertFails(
    getDocs(
      query(
        collection(bob, "messages"),
        where("channelId", "==", "private-room"),
      ),
    ),
  );
  await assertSucceeds(
    getDocs(
      query(
        collection(alice, "messages"),
        where("channelId", "==", "private-room"),
      ),
    ),
  );
});
test("DMs and connections require participant-scoped queries", async () => {
  const alice = env.authenticatedContext("alice").firestore();
  const eve = env.authenticatedContext("eve").firestore();
  for (const name of ["connections", "directMessages"]) {
    await assertSucceeds(
      getDocs(
        query(
          collection(alice, name),
          where("participantIds", "array-contains", "alice"),
        ),
      ),
    );
    await assertFails(
      getDoc(
        doc(
          eve,
          name === "connections"
            ? "connections/alice~bob"
            : "directMessages/alice-bob",
        ),
      ),
    );
    await assertFails(getDocs(collection(eve, name)));
  }
});
test("notifications require the recipient filter and cannot be marked read directly", async () => {
  const alice = env.authenticatedContext("alice").firestore();
  await assertSucceeds(
    getDocs(
      query(collection(alice, "notifications"), where("userId", "==", "alice")),
    ),
  );
  await assertFails(getDocs(collection(alice, "notifications")));
  await assertFails(getDoc(doc(alice, "notifications/bob-notice")));
  await assertFails(
    updateDoc(doc(alice, "notifications/alice-notice"), { read: true }),
  );
});
test("all client content writes are denied, including votes and RSVP capacity", async () => {
  const alice = env.authenticatedContext("alice").firestore();
  for (const path of [
    "profiles/alice",
    "messages/public-message",
    "posts/discussion",
    "events/coffee",
    "connections/alice~bob",
    "directMessages/alice-bob",
    "communities/builders",
    "channels/public-room",
    "conferences/afrotech",
  ])
    await assertFails(setDoc(doc(alice, path), { forged: true }));
});
test("reports are private to reporter and server-owned moderator roles", async () => {
  await assertSucceeds(
    getDoc(
      doc(env.authenticatedContext("alice").firestore(), "reports/report"),
    ),
  );
  await assertFails(
    getDoc(doc(env.authenticatedContext("eve").firestore(), "reports/report")),
  );
  await assertSucceeds(
    getDocs(collection(env.authenticatedContext("mod").firestore(), "reports")),
  );
});
test("trust inputs, rate counters, push tokens, receipts, grants and deletion jobs are inaccessible", async () => {
  const alice = env.authenticatedContext("alice").firestore();
  for (const path of [
    "trustSignals/alice",
    "users/alice/system/rate",
    "users/alice/pushTokens/token",
    "users/alice/requests/request",
    "profileAccess/bob/members/alice",
    "deletionJobs/alice",
  ]) {
    await assertFails(getDoc(doc(alice, path)));
    await assertFails(setDoc(doc(alice, path), { forged: true }));
  }
});
