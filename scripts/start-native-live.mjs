import { createRequire } from "node:module";
import { readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import native from "./native-config.cjs";
import ports from "./native-port.cjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const configIndex = args.indexOf("--public-firebase-config");
const portIndex = args.indexOf("--port");
const start = args.includes("--start");
const check = args.includes("--check");
const validArguments = args.every((arg, index) =>
  index === configIndex + 1 || (portIndex >= 0 && index === portIndex + 1) ||
  ["--public-firebase-config", "--port", "--start", "--check"].includes(arg));
const options = args.filter(arg => arg.startsWith("--"));
if (
  configIndex < 0 ||
  !args[configIndex + 1] ||
  start === check ||
  args.length !== (portIndex >= 0 ? 5 : 3) ||
  !validArguments || new Set(options).size !== options.length
) {
  console.error(
    "Use --public-firebase-config <public SDK JSON path> with exactly one of --check or --start, and optional --port <number>.",
  );
  process.exit(1);
}
try {
  const port = ports.nativePort(portIndex >= 0 ? args[portIndex + 1] : undefined);
  const source = path.resolve(args[configIndex + 1]);
  if (statSync(source).size > 65536)
    throw new Error("The public SDK configuration file is too large.");
  const config = JSON.parse(readFileSync(source, "utf8"));
  const env = native.liveEnvironment(config);
  const runtime = native.resolveNativeRuntime(env);
  console.log(
    `Validated native live mode for ${runtime.firebaseConfig.projectId}. Emulators and dotenv loading are disabled.`,
  );
  if (check) {
    console.log(
      "Validation only. No server, build, account, or deployment was started.",
    );
  } else {
    await ports.assertNativePortAvailable(port);
    const project = path.join(root, "apps/mobile");
    const require = createRequire(path.join(project, "package.json"));
    const cli = path.join(
      path.dirname(require.resolve("expo/package.json")),
      "bin/cli",
    );
    console.log(
      `Starting the separate native live preview on port ${port}. Sign in with your own real account.`,
    );
    const child = spawn(
      process.execPath,
      [
        cli,
        "start",
        "--go",
        "--host",
        "lan",
        "--port",
        String(port),
        "--max-workers",
        "2",
      ],
      {
        cwd: project,
        env: { ...env, CI: "1" },
        stdio: "inherit",
        windowsHide: true,
      },
    );
    for (const signal of ["SIGINT", "SIGTERM"])
      process.on(signal, () => {
        if (child.exitCode === null && !child.killed) child.kill(signal);
      });
    child.on("error", (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
    child.on("exit", (code) => {
      process.exitCode = code ?? 1;
    });
  }
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Native configuration validation failed.",
  );
  process.exitCode = 1;
}
