const { spawn } = require("node:child_process");
const path = require("node:path");

const project = path.resolve(__dirname, "..");
const expoPackage = require.resolve("expo/package.json");
const cli = path.join(path.dirname(expoPackage), "bin", "cli");

console.log("TheLoop stable preview: two Metro workers, file watching disabled.");
console.log("Restart this command after source changes. The normal start command still supports hot reload.");

const child = spawn(process.execPath, [cli, "start", "--go", "--host", "lan", "--port", "8097", "--max-workers", "2", ...process.argv.slice(2)], {
  cwd: project,
  env: { ...process.env, CI: "1" },
  stdio: "inherit",
  windowsHide: true,
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  if (child.exitCode === null && !child.killed) child.kill(signal);
});
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
