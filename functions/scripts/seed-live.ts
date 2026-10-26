import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import {
  firstAfroTechCatalog,
  initializeFirstAfroTech,
  parseSeedOptions,
} from "./liveCatalog.js";

async function main() {
  const options = parseSeedOptions(process.argv.slice(2), process.env);
  const token = process.env.FIREBASE_ADMIN_ACCESS_TOKEN;
  initializeApp({
    projectId: options.projectId,
    credential: token
      ? { getAccessToken: async () => ({ access_token: token, expires_in: 3500 }) }
      : applicationDefault(),
  });
  const db = getFirestore();
  const auth = await getAuth().getUser(options.ownerId);
  const now = new Date().toISOString();
  console.log(JSON.stringify({
    mode: options.apply ? "APPLY" : "DRY RUN — no writes",
    project: options.projectId,
    ownerUid: options.ownerId,
    ownerAdminGrant: "The supplied, verified owner will receive the private admin role if not already an admin.",
    catalog: firstAfroTechCatalog(options.ownerId, now),
  }, null, 2));
  const result = await db.runTransaction((tx) => initializeFirstAfroTech({
    get: async (path) => {
      const snapshot = await tx.get(db.doc(path));
      return snapshot.exists ? snapshot.data() : undefined;
    },
    create: (path, value) => { tx.create(db.doc(path), value); },
    update: (path, value) => { tx.update(db.doc(path), value); },
  }, options, auth, now));
  console.log(JSON.stringify({
    mode: options.apply ? "APPLIED" : "DRY RUN — no writes",
    ...result,
    ownerAdminGrant: result.grantAdmin
      ? options.apply ? "Granted atomically with catalog creation." : "Would grant on --apply."
      : "Already admin; no role write needed.",
    content: "No profiles, messages, events, communities, historical records or invented member counts were inserted.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Catalog initialization failed.");
  process.exitCode = 1;
});
