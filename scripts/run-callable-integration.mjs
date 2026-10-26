import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(resolve(root, "firebase.json"), "utf8"));
const env = { ...process.env };
if (env.THELOOP_INTEGRATION !== "1" || env.THELOOP_MEDIA_INTEGRATION !== "1") {
  throw new Error(
    "Enable both integration suites explicitly; CI must never pass with skipped callables.",
  );
}
const projectId =
  env.THELOOP_INTEGRATION_PROJECT_ID || "demo-theloop-integration";
if (projectId !== "demo-theloop-integration")
  throw new Error(
    "Callable integration only uses the disposable demo-theloop-integration project.",
  );
env.THELOOP_INTEGRATION_PROJECT_ID = projectId;
for (const [service, name] of [
  ["firestore", "THELOOP_INTEGRATION_FIRESTORE_HOST"],
  ["auth", "THELOOP_INTEGRATION_AUTH_HOST"],
  ["functions", "THELOOP_INTEGRATION_FUNCTIONS_HOST"],
  ["storage", "THELOOP_INTEGRATION_STORAGE_HOST"],
]) {
  const port = config.emulators?.[service]?.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`Missing canonical ${service} emulator port.`);
  const host = env[name] || `127.0.0.1:${port}`;
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host))
    throw new Error(
      `${service} integration only connects to a loopback emulator.`,
    );
  env[name] = host;
}
if (!existsSync(resolve(root, "functions/lib/index.js")))
  throw new Error(
    "Build Functions before starting the callable integration emulators.",
  );
console.log(
  "Running both callable suites against disposable loopback emulators.",
);
const child = spawn(
  process.execPath,
  [
    resolve(root, "node_modules/tsx/dist/cli.mjs"),
    "--test",
    "--test-concurrency=1",
    "functions/test/integration.test.ts",
    "functions/test/media.integration.test.ts",
  ],
  { cwd: root, env, stdio: "inherit" },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
