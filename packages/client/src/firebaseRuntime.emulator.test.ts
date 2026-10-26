import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { lazyRuntime, resolveLiveRuntime } from "./lazyRuntime";

test("deferred live transport signs in, calls functions and preserves private-profile access", { timeout: 180_000 }, async t => {
  const endpoint = /^(127\.0\.0\.1|localhost):([0-9]{1,5})$/.exec(process.env.FIRESTORE_EMULATOR_HOST ?? "");
  const firestorePort = Number(endpoint?.[2]);
  if (!endpoint || firestorePort < 1 || firestorePort > 65535) throw new Error("Set explicit loopback FIRESTORE_EMULATOR_HOST for this isolated suite.");
  const host = endpoint[1], authPort = Number(process.env.THELOOP_RUNTIME_AUTH_PORT || 9098), functionsPort = Number(process.env.THELOOP_RUNTIME_FUNCTIONS_PORT || 5019), projectId = "demo-theloop-integration";
  if ([authPort, functionsPort].some(port => !Number.isInteger(port) || port < 1 || port > 65535)) throw new Error("Use valid local emulator ports.");
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `${host}:${authPort}`;
  const backend = createRequire(new URL("../../../functions/package.json", import.meta.url));
  const adminApps = backend("firebase-admin/app"), adminFirestore = backend("firebase-admin/firestore"), adminAuth = backend("firebase-admin/auth");
  const runId = randomUUID().replaceAll("-", "").slice(0, 12), app = adminApps.initializeApp({ projectId }, `lazy-runtime-${runId}`), db = adminFirestore.getFirestore(app), accounts = adminAuth.getAuth(app), ids: string[] = [];
  const load = lazyRuntime(() => import("./firebaseRuntime"));
  let current = true;
  const resolved = await resolveLiveRuntime({ load, prepare: () => undefined, current: () => current });
  assert.ok(resolved);
  const sdk = resolved.runtime, cloud = sdk.setup({ projectId, apiKey: "fake-emulator-key", appId: "lazy-runtime" }, true, undefined, { host, authPort, firestorePort, functionsPort });
  const call = (name: string, payload: unknown) => sdk.httpsCallable(cloud.functions, name, { timeout: 45_000 })(payload);
  try {
    for (const label of ["first", "second"]) {
      const credentials = await sdk.createUserWithEmailAndPassword(cloud.auth, `lazy-${runId}-${label}@example.test`, `Test-${runId}!`); ids.push(credentials.user.uid);
      await sdk.updateProfile(credentials.user, { displayName: `${label} runtime member` });
      t.diagnostic(`${label} SDK account authenticated`);
      await call("bootstrap", { name: `${label} runtime member` });
      await call("executeCommand", { command: { type: "profile.update", profile: { visibility: "connections" } }, requestId: `runtime-${runId}-${label}` });
      const trust = (await call("getTrust", { userId: credentials.user.uid })).data;
      assert.ok(trust && typeof trust === "object");
      const ownProfile = await db.doc(`profiles/${credentials.user.uid}`).get(); assert.equal(ownProfile.exists, true);
      t.diagnostic(`${label} authenticated callable completed`);
    }
    await assert.rejects(new Promise<void>((resolve, reject) => {
      const off = sdk.onSnapshot(sdk.doc(cloud.db, "profiles", ids[0]), () => { off(); resolve(); }, error => { off(); reject(error); });
    }), error => (error as { code?: string }).code === "permission-denied");
    await sdk.firebaseSignOut(cloud.auth);
    current = false;
    const cancelled = await resolveLiveRuntime({ load, prepare: () => { throw new Error("Cancelled scope initialized persistence"); }, current: () => current });
    assert.equal(cancelled, undefined);
  } finally {
    await sdk.firebaseSignOut(cloud.auth);
    for (const uid of ids) {
      await db.recursiveDelete(db.doc(`users/${uid}`)); await db.doc(`profiles/${uid}`).delete();
      await accounts.deleteUser(uid);
    }
    const firebase = await import("firebase/app"); await firebase.deleteApp(cloud.auth.app);
    await adminApps.deleteApp(app);
  }
});
