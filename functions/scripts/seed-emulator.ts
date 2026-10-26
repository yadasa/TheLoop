import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { withContributors } from "../src/contributions";
import { initialState, defaultPreferences } from "../../packages/core/src/seed";
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw new Error(
    "Both Firestore and Auth emulator hosts must be set. This script refuses production.",
  );
const projectId = process.env.GCLOUD_PROJECT || "demo-theloop";
if (!projectId.startsWith("demo-"))
  throw new Error("Only a demo-* emulator project is allowed.");
initializeApp({ projectId });
const db = getFirestore();
const auth = getAuth();
const state = initialState();
async function main() {
  const batch = db.batch();
  for (const profile of state.profiles) {
    await auth
      .createUser({
        uid: profile.id,
        displayName: profile.name,
        email: `${profile.id}@example.test`,
        password: "TheLoop-emulator-only-2026",
        emailVerified: true,
      })
      .catch((error) => {
        if (
          error.code !== "auth/uid-already-exists" &&
          error.code !== "auth/email-already-exists"
        )
          throw error;
      });
    batch.set(db.doc(`profiles/${profile.id}`), profile);
    batch.set(db.doc(`users/${profile.id}`), {
      id: profile.id,
      preferences:
        profile.id === "me"
          ? state.preferences
          : {
              ...defaultPreferences(),
              joinedCommunityIds: state.communities.map((value) => value.id),
            },
      createdAt: profile.joinedAt,
    });
    batch.set(db.doc(`trustSignals/${profile.id}`), {
      emailVerified: true,
      acceptedConnections: 0,
      verifiedAttendance: 0,
    });
  }
  for (const collection of [
    "conferences",
    "channels",
    "messages",
    "communities",
    "posts",
    "events",
    "connections",
    "notifications",
    "directMessages",
  ] as const)
    for (const row of state[collection]) {
      const data: any = { ...row };
      if (collection === "connections" || collection === "directMessages")
        data.participantIds = [data.fromId, data.toId];
      if (collection === "notifications" && !data.read)
        data.unreadUserId = data.userId;
      batch.set(
        db.doc(`${collection}/${row.id}`),
        collection === "posts" ? withContributors(data) : data,
      );
    }
  await batch.commit();
  console.log(
    "Loaded fictional demonstration records into demo-theloop emulators only. Sign in as me@example.test with the emulator-only password documented in BACKEND.md.",
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Emulator seeding failed.",
  );
  process.exitCode = 1;
});
