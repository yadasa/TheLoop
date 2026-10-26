import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { parseNativeRuntime } from "../apps/mobile/src/runtimeConfig";
const require = createRequire(import.meta.url);
const {
  resolveNativeRuntime,
  liveEnvironment,
} = require("./native-config.cjs");
const firebase = {
  apiKey: `AIza${"x".repeat(35)}`,
  authDomain: "theloop-community-2026.firebaseapp.com",
  projectId: "theloop-community-2026",
  storageBucket: "theloop-community-2026.firebasestorage.app",
  messagingSenderId: "36048778692",
  appId: "1:36048778692:web:305b0d27b79eb1475d6091",
};
const emulator = (host = "127.0.0.1") =>
  resolveNativeRuntime({
    THELOOP_NATIVE_MODE: "emulator",
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: "demo-theloop-runtime",
    EXPO_PUBLIC_EMULATOR_HOST: host,
  });
test("build resolver and device parser agree for all supported modes and local hosts", () => {
  const values = [
    resolveNativeRuntime({}),
    resolveNativeRuntime(liveEnvironment(firebase, {})),
    ...[
      "localhost",
      "127.0.0.1",
      "::1",
      "192.168.1.3",
      "10.0.0.9",
      "172.31.1.2",
      "desktop",
      "desktop.local",
    ].map(emulator),
  ];
  for (const value of values)
    assert.deepEqual(parseNativeRuntime(value), value);
});
test("missing/corrupt schema never becomes sample or live implicitly", () => {
  for (const raw of [
    undefined,
    null,
    [],
    "sample",
    {},
    { mode: "sample" },
    { schemaVersion: "1", mode: "sample" },
    { schemaVersion: 2, mode: "sample" },
    { schemaVersion: 1, mode: "unknown" },
  ])
    assert.throws(() => parseNativeRuntime(raw), /configuration is invalid/);
});
test("sample cannot smuggle Firebase or emulator authority", () => {
  for (const extra of [
    { firebaseConfig: firebase },
    { emulators: {} },
    { unused: true },
  ])
    assert.throws(
      () => parseNativeRuntime({ schemaVersion: 1, mode: "sample", ...extra }),
      /fields do not match/,
    );
});
test("live rejects each missing/wrong field, unknown fields, and emulator configuration", () => {
  const valid = resolveNativeRuntime(liveEnvironment(firebase, {}));
  for (const key of Object.keys(firebase)) {
    const missing = structuredClone(valid);
    delete missing.firebaseConfig[key];
    assert.throws(
      () => parseNativeRuntime(missing),
      /configuration is invalid/,
    );
    const wrong = structuredClone(valid);
    wrong.firebaseConfig[key] = "another-project-or-value";
    assert.throws(() => parseNativeRuntime(wrong), /configuration is invalid/);
  }
  assert.throws(
    () => parseNativeRuntime({ ...valid, emulators: { host: "localhost" } }),
    /fields do not match/,
  );
  assert.throws(
    () =>
      parseNativeRuntime({
        ...valid,
        firebaseConfig: { ...firebase, privateKey: "never-echo-this" },
      }),
    (error: Error) => !error.message.includes("never-echo-this"),
  );
});
test("emulator parser rejects production IDs, public hosts, ambiguous ports and mixed demo fields", () => {
  const valid = emulator();
  for (const host of [
    "0.0.0.0",
    "8.8.8.8",
    "134744072",
    "0x08080808",
    "010.0.0.1",
    "010.0.0.4",
    "127.1",
    "example.com",
    "http://localhost",
    "localhost:9099",
  ])
    assert.throws(
      () =>
        parseNativeRuntime({
          ...valid,
          emulators: { ...valid.emulators, host },
        }),
      /local\/LAN/,
    );
  for (const authPort of [0, -1, 65536, 9099.5, "9099", NaN, Infinity])
    assert.throws(
      () =>
        parseNativeRuntime({
          ...valid,
          emulators: { ...valid.emulators, authPort },
        }),
      /bounded integers/,
    );
  assert.throws(
    () =>
      parseNativeRuntime({
        ...valid,
        emulators: {
          ...valid.emulators,
          authPort: valid.emulators.firestorePort,
        },
      }),
    /distinct/,
  );
  assert.throws(
    () => parseNativeRuntime({ ...valid, firebaseConfig: firebase }),
    /demo project/,
  );
  assert.throws(
    () =>
      parseNativeRuntime({
        ...valid,
        firebaseConfig: {
          ...valid.firebaseConfig,
          authDomain: "another-demo.firebaseapp.com",
        },
      }),
    /demo project/,
  );
});
