import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const arg = (flag: string) => process.argv[process.argv.indexOf(flag) + 1];
const projectId = process.argv.includes("--project") ? arg("--project") : "";
const ownerId = process.argv.includes("--owner") ? arg("--owner") : "";
if (!projectId || !/^theloop-[a-z0-9-]+$/.test(projectId))
  throw new Error(
    "Pass an explicitly named dedicated TheLoop project with --project.",
  );
if (!ownerId || !/^[A-Za-z0-9_-]{1,128}$/.test(ownerId))
  throw new Error("Pass the authenticated community owner UID with --owner.");
if (process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error("Use seed:emulator for emulator data.");
const token = process.env.FIREBASE_ADMIN_ACCESS_TOKEN;
initializeApp({
  projectId,
  credential: token
    ? {
        getAccessToken: async () => ({ access_token: token, expires_in: 3500 }),
      }
    : applicationDefault(),
});
const db = getFirestore();
const catalog: Record<string, Record<string, unknown>> = {
  "conferences/afrotech": {
    id: "afrotech",
    name: "AfroTech community",
    shortName: "AF",
    city: "Houston, TX",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    description:
      "An independent community hub for the conversations before, during, and after AfroTech. Not an official conference schedule or affiliation.",
    members: 0,
    tagline: "Same energy. A better space.",
  },
  "conferences/everyday": {
    id: "everyday",
    name: "Beyond the conference",
    shortName: "∞",
    city: "Everywhere",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    description: "Keep the connections going all year.",
    members: 0,
    tagline: "Keep the connection going.",
  },
  "channels/the-lobby": {
    id: "the-lobby",
    conferenceId: "afrotech",
    name: "the-lobby",
    description: "Your people. Your first hello. Pull up a chair.",
    icon: "◎",
    members: 0,
    topics: ["Introductions", "First timers", "Making plans"],
    visibility: "public",
  },
  "channels/career-moves": {
    id: "career-moves",
    conferenceId: "afrotech",
    name: "career-moves",
    description: "Warm intros, real advice, and the next right move.",
    icon: "↗",
    members: 0,
    topics: ["Open roles", "Resume swaps", "Career pivots"],
    visibility: "public",
  },
  "channels/after-hours": {
    id: "after-hours",
    conferenceId: "afrotech",
    name: "after-hours",
    description: "Good food, great music, and the plans after the plans.",
    icon: "☾",
    members: 0,
    topics: ["Dinner plans", "The playlist", "Night owls"],
    visibility: "public",
  },
  "channels/founders-table": {
    id: "founders-table",
    conferenceId: "afrotech",
    name: "founders-table",
    description: "From first idea to next round. Build in good company.",
    icon: "◇",
    members: 0,
    topics: ["Build in public", "Funding", "Co-founder intros"],
    visibility: "public",
  },
  "channels/design-circle": {
    id: "design-circle",
    conferenceId: "everyday",
    name: "design-circle",
    description: "Thoughtful craft and honest feedback.",
    icon: "◈",
    members: 0,
    topics: ["Portfolio feedback", "Inspiration", "Design systems"],
    visibility: "public",
  },
  "channels/wellness": {
    id: "wellness",
    conferenceId: "everyday",
    name: "wellness",
    description: "A little room to breathe. Mind, body, and community.",
    icon: "○",
    members: 0,
    topics: ["Morning walks", "Check in", "Small wins"],
    visibility: "public",
  },
  "communities/builders": {
    id: "builders",
    slug: "builders",
    name: "The Builders Circle",
    description: "Share the work. Find your people.",
    members: 0,
    icon: "◇",
    rules: [
      "Build with respect.",
      "Give more than you take.",
      "No unsolicited pitches or spam.",
    ],
    moderatorIds: [ownerId],
    creatorId: ownerId,
  },
  "communities/culture": {
    id: "culture",
    slug: "culture",
    name: "Culture & Connection",
    description:
      "The music, moments, and conversations that make this feel like us.",
    members: 0,
    icon: "◎",
    rules: ["Be kind and stay curious.", "Credit original creators."],
    moderatorIds: [ownerId],
    creatorId: ownerId,
  },
  "communities/career": {
    id: "career",
    slug: "career",
    name: "Next Chapter",
    description: "Career moves with community behind you.",
    members: 0,
    icon: "↗",
    rules: [
      "Share compensation when posting a role.",
      "No pay-to-apply opportunities.",
    ],
    moderatorIds: [ownerId],
    creatorId: ownerId,
  },
};
async function main() {
  const user = await db.doc(`users/${ownerId}`).get();
  if (!user.exists)
    throw new Error(
      "The owner must sign in and complete bootstrap before catalog initialization.",
    );
  let created = 0;
  for (const [path, value] of Object.entries(catalog)) {
    await db.runTransaction(async (tx) => {
      const ref = db.doc(path);
      const existing = await tx.get(ref);
      if (existing.exists) return;
      tx.create(ref, value);
      created++;
    });
  }
  await db.doc(`users/${ownerId}`).update({ role: "admin" });
  console.log(
    `Initialized ${created} missing catalog resources in ${projectId}. No fabricated profiles, messages, events or member counts were inserted.`,
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Catalog initialization failed.",
  );
  process.exitCode = 1;
});
