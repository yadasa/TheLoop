export type NativeFirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};
export type NativeEmulators = {
  host: string;
  authPort: number;
  firestorePort: number;
  functionsPort: number;
};
export type NativeRuntimeConfig =
  | { schemaVersion: 1; mode: "sample" }
  | { schemaVersion: 1; mode: "live"; firebaseConfig: NativeFirebaseConfig }
  | {
      schemaVersion: 1;
      mode: "emulator";
      firebaseConfig: NativeFirebaseConfig;
      emulators: NativeEmulators;
    };

const project = "theloop-community-2026";
const sender = "36048778692";
const firebaseFields = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
] as const;
function invalid(detail: string): never {
  throw new Error(
    `This build's TheLoop configuration is invalid: ${detail} Use a validated sample, live, or emulator build.`,
  );
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("configuration must be an object.");
  return value as Record<string, unknown>;
}
function exactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
) {
  if (
    Object.keys(value).length !== fields.length ||
    fields.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  )
    invalid("configuration fields do not match the selected mode.");
}
function localHost(host: string) {
  if (host === "localhost" || host === "::1") return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (host.split(".").some((part) => part !== String(Number(part))))
      return false;
    const parts = host.split(".").map(Number);
    if (parts.some((part) => part < 0 || part > 255)) return false;
    const [a, b] = parts;
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
/** Decode public Expo manifest data without trusting mode labels or partial identifiers. */
export function parseNativeRuntime(value: unknown): NativeRuntimeConfig {
  const raw = object(value);
  if (raw.schemaVersion !== 1) invalid("unsupported schema version.");
  if (raw.mode === "sample") {
    exactFields(raw, ["schemaVersion", "mode"]);
    return { schemaVersion: 1, mode: "sample" };
  }
  if (raw.mode !== "live" && raw.mode !== "emulator")
    invalid("choose an explicit supported mode.");
  exactFields(
    raw,
    raw.mode === "live"
      ? ["schemaVersion", "mode", "firebaseConfig"]
      : ["schemaVersion", "mode", "firebaseConfig", "emulators"],
  );
  const source = object(raw.firebaseConfig);
  exactFields(source, firebaseFields);
  const config = {} as NativeFirebaseConfig;
  for (const key of firebaseFields) {
    const field = source[key];
    if (typeof field !== "string" || !field.trim())
      invalid(`missing public Firebase ${key}.`);
    config[key] = field.trim();
  }
  if (raw.mode === "live") {
    if (
      config.projectId !== project ||
      config.authDomain !== `${project}.firebaseapp.com` ||
      config.storageBucket !== `${project}.firebasestorage.app` ||
      config.messagingSenderId !== sender ||
      !/^AIza[A-Za-z0-9_-]{35}$/.test(config.apiKey) ||
      !new RegExp(`^1:${sender}:(web|android|ios):[A-Za-z0-9]+$`).test(
        config.appId,
      )
    )
      invalid("live identifiers must match the dedicated TheLoop project.");
    return { schemaVersion: 1, mode: "live", firebaseConfig: config };
  }
  if (
    !/^demo-[a-z0-9][a-z0-9-]{0,58}$/.test(config.projectId) ||
    config.apiKey !== "demo-api-key" ||
    config.authDomain !== `${config.projectId}.firebaseapp.com` ||
    config.storageBucket !== `${config.projectId}.firebasestorage.app` ||
    config.messagingSenderId !== "000000000000" ||
    config.appId !== "1:000000000000:web:demo"
  )
    invalid("emulator identifiers must match one demo project.");
  const emulators = object(raw.emulators);
  exactFields(emulators, [
    "host",
    "authPort",
    "firestorePort",
    "functionsPort",
  ]);
  if (typeof emulators.host !== "string" || !localHost(emulators.host))
    invalid("emulator host must be a local/LAN address.");
  for (const key of ["authPort", "firestorePort", "functionsPort"] as const)
    if (
      typeof emulators[key] !== "number" ||
      !Number.isInteger(emulators[key]) ||
      emulators[key] < 1 ||
      emulators[key] > 65535
    )
      invalid("emulator ports must be bounded integers.");
  if (
    new Set([
      emulators.authPort,
      emulators.firestorePort,
      emulators.functionsPort,
    ]).size !== 3
  )
    invalid("emulator ports must be distinct.");
  return {
    schemaVersion: 1,
    mode: "emulator",
    firebaseConfig: config,
    emulators: {
      host: emulators.host,
      authPort: emulators.authPort as number,
      firestorePort: emulators.firestorePort as number,
      functionsPort: emulators.functionsPort as number,
    },
  };
}
