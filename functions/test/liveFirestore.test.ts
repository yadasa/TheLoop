import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applicationDefault,
  deleteApp,
  initializeApp,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { createLiveFirestore } from "../scripts/liveFirestore.js";

test("initializer bearer credentials reach the real Firestore client without Admin certificate requirements or network", async () => {
  const token = "in-memory-unit-fixture-not-a-real-token";
  const db = createLiveFirestore("theloop-credential-test", token);
  try {
    const settings = (
      db as unknown as {
        _settings: {
          projectId: string;
          authClient: OAuth2Client;
          credentials?: unknown;
          keyFilename?: unknown;
        };
      }
    )._settings;
    assert.equal(settings.projectId, "theloop-credential-test");
    assert.ok(settings.authClient instanceof OAuth2Client);
    assert.equal(settings.credentials, undefined);
    assert.equal(settings.keyFilename, undefined);
    assert.deepEqual(settings.authClient.credentials, { access_token: token });
    // This is the GoogleAuth path used by the installed google-gax transport.
    const transport = new GoogleAuth({
      projectId: settings.projectId,
      authClient: settings.authClient,
    });
    assert.equal(await transport.getClient(), settings.authClient);
    const headers = await settings.authClient.getRequestHeaders();
    assert.equal(new Headers(headers).get("authorization"), `Bearer ${token}`);
  } finally {
    await db.terminate();
  }
});

test("initializer without an explicit bearer preserves the existing ADC Firestore path", async () => {
  const app = initializeApp({
    projectId: "theloop-adc-test",
    credential: applicationDefault(),
  });
  try {
    assert.equal(createLiveFirestore("theloop-adc-test"), getFirestore());
  } finally {
    await deleteApp(app);
  }
});
