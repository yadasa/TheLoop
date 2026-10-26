const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveNativeRuntime,
  liveEnvironment,
  cleanNativeEnvironment,
  FIELDS,
} = require("./native-config.cjs");
const config = {
  apiKey: `AIza${"x".repeat(35)}`,
  projectId: "theloop-community-2026",
  authDomain: "theloop-community-2026.firebaseapp.com",
  storageBucket: "theloop-community-2026.firebasestorage.app",
  messagingSenderId: "36048778692",
  appId: "1:36048778692:web:305b0d27b79eb1475d6091",
};
const live = () => liveEnvironment(config, {});
const emulator = (host = "127.0.0.1") => ({
  THELOOP_NATIVE_MODE: "emulator",
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: "demo-theloop",
  EXPO_PUBLIC_EMULATOR_HOST: host,
});

test("sample is the default and does not inherit Firebase, emulator, or arbitrary public data", () => {
  const env = {
    ...live(),
    THELOOP_NATIVE_MODE: "",
    EXPO_PUBLIC_EMULATOR_HOST: "unrelated.example",
    EXPO_PUBLIC_SECRET_CANARY: "never-manifest",
  };
  assert.deepEqual(resolveNativeRuntime(env), {
    schemaVersion: 1,
    mode: "sample",
  });
});
test("sample preview stays explicit; live release profiles cannot silently become sample", () => {
  assert.deepEqual(resolveNativeRuntime({ EAS_BUILD_PROFILE: "preview" }), {
    schemaVersion: 1,
    mode: "sample",
  });
  assert.throws(
    () => resolveNativeRuntime({ ...live(), EAS_BUILD_PROFILE: "preview" }),
    /sample-only/,
  );
  for (const profile of ["livepreview", "production"]) {
    assert.throws(
      () => resolveNativeRuntime({ EAS_BUILD_PROFILE: profile }),
      /requires THELOOP_NATIVE_MODE=live/,
    );
    assert.equal(
      resolveNativeRuntime({ ...live(), EAS_BUILD_PROFILE: profile }).mode,
      "live",
    );
  }
  assert.throws(
    () => resolveNativeRuntime({ THELOOP_NATIVE_MODE: "typo" }),
    /must be sample, live, or emulator/,
  );
});
test("live requires every dedicated identifier and emits public config only", () => {
  for (const key of Object.values(FIELDS)) {
    const env = live();
    delete env[key];
    assert.throws(
      () => resolveNativeRuntime(env),
      /Missing EXPO_PUBLIC_FIREBASE_/,
    );
  }
  for (const [key, wrong] of Object.entries({
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: "another-project",
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: "another.firebaseapp.com",
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: "another.appspot.com",
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "999999",
    EXPO_PUBLIC_FIREBASE_APP_ID: "1:999999:web:abc",
    EXPO_PUBLIC_FIREBASE_API_KEY: "not-an-api-key",
  }))
    assert.throws(
      () => resolveNativeRuntime({ ...live(), [key]: wrong }),
      /configuration:/,
    );
  const runtime = resolveNativeRuntime({
    ...live(),
    PRIVATE_KEY: "never-manifest",
    EXPO_PUBLIC_UNUSED: "never-manifest",
  });
  assert.deepEqual(runtime, {
    schemaVersion: 1,
    mode: "live",
    firebaseConfig: config,
  });
  assert.ok(!JSON.stringify(runtime).includes("never-manifest"));
});
test("live fails when any public or Admin emulator setting is present", () => {
  for (const key of [
    "EXPO_PUBLIC_EMULATOR_HOST",
    "EXPO_PUBLIC_AUTH_EMULATOR_PORT",
    "EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT",
    "EXPO_PUBLIC_FUNCTIONS_EMULATOR_PORT",
    "FIREBASE_AUTH_EMULATOR_HOST",
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_STORAGE_EMULATOR_HOST",
    "FUNCTIONS_EMULATOR_HOST",
  ])
    assert.throws(
      () => resolveNativeRuntime({ ...live(), [key]: "9099" }),
      /Remove emulator settings/,
    );
});
test("emulators use only demo namespaces and approved local addresses", () => {
  for (const host of [
    "127.0.0.1",
    "localhost",
    "::1",
    "10.0.0.4",
    "172.16.1.4",
    "192.168.1.8",
    "my-desktop",
    "my-desktop.local",
  ])
    assert.equal(resolveNativeRuntime(emulator(host)).emulators.host, host);
  for (const host of [
    "",
    "0.0.0.0",
    "8.8.8.8",
    "134744072",
    "0x08080808",
    "010.0.0.1",
    "010.0.0.4",
    "127.1",
    "172.32.1.4",
    "192.168.999.1",
    "https://localhost",
    "localhost:9099",
    "user@localhost",
    "example.com",
    "../localhost",
  ])
    assert.throws(() => resolveNativeRuntime(emulator(host)), /emulator host/);
  assert.throws(
    () =>
      resolveNativeRuntime({
        ...emulator(),
        EXPO_PUBLIC_FIREBASE_PROJECT_ID: config.projectId,
      }),
    /demo-\*/,
  );
  assert.throws(
    () =>
      resolveNativeRuntime({ ...emulator(), EAS_BUILD_PROFILE: "livepreview" }),
    /requires THELOOP_NATIVE_MODE=live/,
  );
  const result = resolveNativeRuntime({
    ...emulator(),
    EXPO_PUBLIC_FIREBASE_API_KEY: config.apiKey,
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: config.authDomain,
  });
  assert.equal(result.firebaseConfig.apiKey, "demo-api-key");
  assert.equal(
    result.firebaseConfig.authDomain,
    "demo-theloop.firebaseapp.com",
  );
});
test("emulator ports are bounded integers and distinct", () => {
  for (const raw of ["0", "65536", "-1", "9099.1", "1e3", "foo"])
    assert.throws(
      () =>
        resolveNativeRuntime({
          ...emulator(),
          EXPO_PUBLIC_AUTH_EMULATOR_PORT: raw,
        }),
      /integer from 1 to 65535/,
    );
  assert.throws(
    () =>
      resolveNativeRuntime({
        ...emulator(),
        EXPO_PUBLIC_AUTH_EMULATOR_PORT: "8080",
      }),
    /must be distinct/,
  );
  assert.deepEqual(resolveNativeRuntime(emulator()).emulators, {
    host: "127.0.0.1",
    authPort: 9099,
    firestorePort: 8080,
    functionsPort: 5001,
  });
});
test("local live environment removes inherited public/emulator values and disables dotenv", () => {
  const inherited = {
    PATH: "system-path",
    EAS_BUILD_PROFILE: "preview",
    EXPO_PUBLIC_FIREBASE_API_KEY: "unrelated",
    EXPO_PUBLIC_WEB_URL: "https://unrelated.example",
    EXPO_PUBLIC_SECRET_CANARY: "never-bundle",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
    EXPO_PUBLIC_EMULATOR_HOST: "localhost",
    THELOOP_NATIVE_MODE: "emulator",
  };
  const clean = cleanNativeEnvironment(inherited);
  assert.deepEqual(clean, { PATH: "system-path", EXPO_NO_DOTENV: "1" });
  const result = liveEnvironment(config, inherited);
  assert.equal(result.PATH, "system-path");
  assert.equal(result.EXPO_NO_DOTENV, "1");
  assert.equal(result.EXPO_PUBLIC_SECRET_CANARY, undefined);
  assert.deepEqual(resolveNativeRuntime(result).firebaseConfig, config);
  assert.equal(inherited.THELOOP_NATIVE_MODE, "emulator");
});
