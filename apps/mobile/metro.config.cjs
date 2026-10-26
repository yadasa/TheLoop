const { getDefaultConfig } = require("expo/metro-config");
const { getConfig } = require("expo/config");
const {
  nativeMetroCacheVersion,
} = require("../../scripts/native-metro-cache.cjs");
const config = getDefaultConfig(__dirname);
const { exp } = getConfig(__dirname, {
  isPublicConfig: true,
  skipSDKVersionRequirement: true,
});
config.cacheVersion = nativeMetroCacheVersion(
  config.cacheVersion,
  process.env,
  exp,
);
module.exports = config;
