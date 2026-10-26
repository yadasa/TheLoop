// Build the sample preview, with an optional dedicated live sign-in at /live/.
// The supplied JSON contains public Firebase client identifiers, never admin keys.
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { readFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const web = path.join(root, "apps/web");
function run(script, args, env = process.env) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: web, env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.signal || result.status !== 0) throw new Error(`Web build failed (${result.signal || result.status}).`);
}
const compiler = require.resolve("typescript/bin/tsc");
const vite = path.resolve(path.dirname(require.resolve("vite/package.json")), "bin/vite.js");
const clean = { ...process.env };
for (const key of Object.keys(clean)) if (key.startsWith("VITE_FIREBASE_") || key.startsWith("VITE_EMULATOR_") || key === "VITE_USE_EMULATORS") delete clean[key];
clean.THELOOP_ISOLATED_WEB_BUILD = "1";
clean.NODE_ENV = "production";
delete clean.VITE_USER_NODE_ENV;
clean.VITE_USE_EMULATORS = "false";
clean.VITE_FIREBASE_API_KEY = "";
run(compiler, ["-p", "tsconfig.json"], clean);
run(vite, ["build"], clean);
const input = process.argv.slice(2);
if (input.length) {
  if (input.length !== 2 || input[0] !== "--public-firebase-config") throw new Error("Use --public-firebase-config <public SDK JSON path>.");
  const config = JSON.parse(readFileSync(path.resolve(input[1]), "utf8"));
  if (config.projectId !== "theloop-community-2026" || !["apiKey", "authDomain", "projectId", "storageBucket", "appId"].every(field => typeof config[field] === "string" && config[field].trim()) || config.authDomain !== "theloop-community-2026.firebaseapp.com" || config.storageBucket !== "theloop-community-2026.firebasestorage.app") throw new Error("The dedicated TheLoop public Firebase SDK configuration is required.");
  const live = { ...clean };
  for (const [field, key] of Object.entries({ apiKey: "API_KEY", authDomain: "AUTH_DOMAIN", projectId: "PROJECT_ID", storageBucket: "STORAGE_BUCKET", appId: "APP_ID" })) if (typeof config[field] === "string") live[`VITE_FIREBASE_${key}`] = config[field];
  run(vite, ["build", "--base", "/live/", "--outDir", "../../dist/live", "--emptyOutDir"], live);
  // Root-relative brand/bootstrap URLs are available at both paths; Vite copies
  // the same public assets into /live/ as well.
}
copyFileSync(path.join(root, "docs/product-and-cost-map.html"), path.join(root, "dist/product-map.html"));
console.log("Built sample preview, product map and requested live sign-in path.");
