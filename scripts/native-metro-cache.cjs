const { createHash } = require("node:crypto");
const { resolveNativeRuntime } = require("./native-config.cjs");

/** Expo web Constants inline app config, so environments need separate transforms. */
function nativeMetroCacheVersion(
  existingVersion,
  env = process.env,
  publicConfig,
) {
  const runtime = resolveNativeRuntime(env);
  if (
    publicConfig !== undefined &&
    JSON.stringify(publicConfig?.extra?.theloop) !== JSON.stringify(runtime)
  )
    throw new Error(
      "Resolved Expo configuration must contain the validated TheLoop runtime.",
    );
  const digest = createHash("sha256")
    .update(JSON.stringify({ runtime, publicConfig: publicConfig ?? null }))
    .digest("hex");
  return `${existingVersion ?? ""}|theloop-runtime-v1:${digest}`;
}

module.exports = { nativeMetroCacheVersion };
