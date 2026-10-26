const fs = require("node:fs");
const path = require("node:path");
const PROJECT = "theloop-community-2026";
const PROJECT_NUMBER = "36048778692";
const PACKAGE = "co.theloop.community";
function invalid(message) {
  throw new Error(`TheLoop Android configuration: ${message}`);
}
function validateAndroidPublicConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(
      "Use the public google-services.json configuration, not a service-account credential.",
    );
  if (
    value.type === "service_account" ||
    ["private_key", "private_key_id", "client_email", "token_uri"].some((key) =>
      Object.prototype.hasOwnProperty.call(value, key),
    )
  )
    invalid("Service-account credentials are not accepted in the mobile app.");
  if (
    value.project_info?.project_id !== PROJECT ||
    String(value.project_info?.project_number) !== PROJECT_NUMBER ||
    value.project_info?.storage_bucket !== `${PROJECT}.firebasestorage.app`
  )
    invalid(
      "The public file must belong to the dedicated TheLoop project and bucket.",
    );
  if (
    !Array.isArray(value.client) ||
    value.client.length < 1 ||
    value.client.length > 20
  )
    invalid(
      "The public file must include the Android application configuration.",
    );
  const android = value.client.filter(
    (client) => client?.client_info?.android_client_info,
  );
  if (
    android.length !== 1 ||
    android[0].client_info.android_client_info.package_name !== PACKAGE
  )
    invalid(
      "The public file must contain only the co.theloop.community Android application.",
    );
  const appId = android[0].client_info.mobilesdk_app_id;
  if (
    typeof appId !== "string" ||
    !/^1:36048778692:android:[A-Za-z0-9]+$/.test(appId)
  )
    invalid(
      "The Android Firebase app ID must belong to the dedicated project number.",
    );
  if (
    !Array.isArray(android[0].api_key) ||
    !android[0].api_key.some(
      (entry) =>
        typeof entry?.current_key === "string" &&
        /^AIza[A-Za-z0-9_-]{35}$/.test(entry.current_key),
    )
  )
    invalid("The public file is missing its Firebase API key.");
  return { projectId: PROJECT, packageName: PACKAGE, appId };
}
function readAndroidPublicConfig(file, projectRoot) {
  if (
    typeof file !== "string" ||
    !file.trim() ||
    file.length > 4096 ||
    /[\r\n\0]/.test(file)
  )
    invalid(
      "Supply a local path or an EAS file variable for google-services.json.",
    );
  const filename = path.resolve(projectRoot, file.trim());
  let json;
  try {
    const stat = fs.statSync(filename);
    if (!stat.isFile() || stat.size < 1 || stat.size > 65536)
      invalid("The public configuration file must be at most 64 KiB.");
    json = JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch {
    // Never echo file contents, supplied paths, or JSON parse excerpts.
    invalid(
      "The Android public configuration could not be read. Use a valid local path or an EAS file variable.",
    );
  }
  return { filename, ...validateAndroidPublicConfig(json) };
}
function configureAndroid(base, runtime, env, projectRoot) {
  const android = { ...(base || {}) };
  delete android.googleServicesFile;
  if (runtime.mode !== "live") return android;
  const file = String(env.THELOOP_GOOGLE_SERVICES_FILE || "").trim();
  const required =
    env.EAS_BUILD_PLATFORM === "android" &&
    ["livepreview", "production"].includes(env.EAS_BUILD_PROFILE);
  if (!file) {
    if (required)
      invalid(
        "Live Android builds require THELOOP_GOOGLE_SERVICES_FILE as a validated local path or EAS file variable.",
      );
    return android;
  }
  if (android.package !== PACKAGE)
    invalid("The Expo Android package must be co.theloop.community.");
  android.googleServicesFile = readAndroidPublicConfig(
    file,
    projectRoot,
  ).filename;
  return android;
}
module.exports = {
  validateAndroidPublicConfig,
  readAndroidPublicConfig,
  configureAndroid,
};
