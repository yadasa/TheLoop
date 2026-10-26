const PROJECT = "theloop-community-2026";
const PROJECT_NUMBER = "36048778692";
const FIELDS = {
  apiKey: "EXPO_PUBLIC_FIREBASE_API_KEY",
  authDomain: "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  storageBucket: "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  appId: "EXPO_PUBLIC_FIREBASE_APP_ID",
};
const EMULATOR_KEYS = [
  "EXPO_PUBLIC_EMULATOR_HOST",
  "EXPO_PUBLIC_AUTH_EMULATOR_PORT",
  "EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT",
  "EXPO_PUBLIC_FUNCTIONS_EMULATOR_PORT",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_STORAGE_EMULATOR_HOST",
  "FUNCTIONS_EMULATOR_HOST",
];
const value = (env, key) => String(env[key] ?? "").trim();
function invalid(message) {
  throw new Error(`TheLoop native configuration: ${message}`);
}
function validateLiveConfig(config) {
  for (const field of Object.keys(FIELDS))
    if (typeof config?.[field] !== "string" || !config[field].trim())
      invalid(
        `Missing ${FIELDS[field]}. Supply the dedicated public Firebase SDK configuration.`,
      );
  const result = Object.fromEntries(
    Object.keys(FIELDS).map((field) => [field, config[field].trim()]),
  );
  if (
    result.projectId !== PROJECT ||
    result.authDomain !== `${PROJECT}.firebaseapp.com` ||
    result.storageBucket !== `${PROJECT}.firebasestorage.app` ||
    result.messagingSenderId !== PROJECT_NUMBER
  )
    invalid(
      `Live builds must use the dedicated ${PROJECT} project, domain, bucket, and sender ID.`,
    );
  if (!/^AIza[A-Za-z0-9_-]{35}$/.test(result.apiKey))
    invalid("The public Firebase API key has an invalid format.");
  if (
    !new RegExp(`^1:${PROJECT_NUMBER}:(web|android|ios):[A-Za-z0-9]+$`).test(
      result.appId,
    )
  )
    invalid("The Firebase app ID must belong to the dedicated project number.");
  return result;
}
function privateHost(host) {
  if (host === "localhost" || host === "::1") return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (host.split(".").some((part) => part !== String(Number(part))))
      return false;
    const octets = host.split(".").map(Number);
    if (octets.some((n) => n < 0 || n > 255)) return false;
    const [a, b] = octets;
    return (
      a === 127 ||
      a === 10 ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31)
    );
  }
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return false;
  return (
    host.length <= 253 &&
    /^(?=.{1,63}(?:\.local)?$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.local)?$/i.test(
      host,
    )
  );
}
function port(env, key, fallback) {
  const raw = value(env, key) || String(fallback);
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 65535)
    invalid(`${key} must be an integer from 1 to 65535.`);
  return Number(raw);
}
function resolveNativeRuntime(env = process.env) {
  const mode = value(env, "THELOOP_NATIVE_MODE") || "sample";
  const profile = value(env, "EAS_BUILD_PROFILE");
  if (!["sample", "live", "emulator"].includes(mode))
    invalid("THELOOP_NATIVE_MODE must be sample, live, or emulator.");
  if (profile === "preview" && mode !== "sample")
    invalid(
      "The preview profile is sample-only. Use livepreview for a live build.",
    );
  if (["livepreview", "production"].includes(profile) && mode !== "live")
    invalid(
      `The ${profile} profile requires THELOOP_NATIVE_MODE=live and complete live configuration.`,
    );
  if (mode === "sample") return { schemaVersion: 1, mode };
  if (mode === "live") {
    if (EMULATOR_KEYS.some((key) => value(env, key)))
      invalid(
        "Remove emulator settings before starting or building live mode.",
      );
    const config = Object.fromEntries(
      Object.entries(FIELDS).map(([field, key]) => [field, value(env, key)]),
    );
    return {
      schemaVersion: 1,
      mode,
      firebaseConfig: validateLiveConfig(config),
    };
  }
  if (profile && profile !== "development")
    invalid(
      "Emulators are only supported in local development or the development profile.",
    );
  const projectId = value(env, FIELDS.projectId);
  if (!/^demo-[a-z0-9][a-z0-9-]{0,58}$/.test(projectId))
    invalid(
      "Emulator mode requires a demo-* Firebase project ID; production projects are refused.",
    );
  const host = value(env, "EXPO_PUBLIC_EMULATOR_HOST");
  if (!privateHost(host))
    invalid(
      "Use localhost, a private/loopback IP, or a single-label/.local LAN hostname for the emulator host.",
    );
  const emulators = {
    host,
    authPort: port(env, "EXPO_PUBLIC_AUTH_EMULATOR_PORT", 9099),
    firestorePort: port(env, "EXPO_PUBLIC_FIRESTORE_EMULATOR_PORT", 8080),
    functionsPort: port(env, "EXPO_PUBLIC_FUNCTIONS_EMULATOR_PORT", 5001),
  };
  if (
    new Set([
      emulators.authPort,
      emulators.firestorePort,
      emulators.functionsPort,
    ]).size !== 3
  )
    invalid("Auth, Firestore, and Functions emulator ports must be distinct.");
  return {
    schemaVersion: 1,
    mode,
    firebaseConfig: {
      apiKey: "demo-api-key",
      projectId,
      authDomain: `${projectId}.firebaseapp.com`,
      storageBucket: `${projectId}.firebasestorage.app`,
      messagingSenderId: "000000000000",
      appId: "1:000000000000:web:demo",
    },
    emulators,
  };
}
function cleanNativeEnvironment(input = process.env) {
  const env = { ...input };
  for (const key of Object.keys(env))
    if (
      key.startsWith("EXPO_PUBLIC_") ||
      key.startsWith("THELOOP_NATIVE_") ||
      EMULATOR_KEYS.includes(key) ||
      key === "EAS_BUILD_PROFILE"
    )
      delete env[key];
  env.EXPO_NO_DOTENV = "1";
  return env;
}
function liveEnvironment(config, input = process.env) {
  const approved = validateLiveConfig(config);
  const env = cleanNativeEnvironment(input);
  env.THELOOP_NATIVE_MODE = "live";
  for (const [field, key] of Object.entries(FIELDS)) env[key] = approved[field];
  return env;
}
module.exports = {
  PROJECT,
  FIELDS,
  resolveNativeRuntime,
  validateLiveConfig,
  cleanNativeEnvironment,
  liveEnvironment,
};
