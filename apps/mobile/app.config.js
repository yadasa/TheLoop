const { resolveNativeRuntime } = require("../../scripts/native-config.cjs");

module.exports = ({ config }) => ({
  ...config,
  extra: { ...config.extra, theloop: resolveNativeRuntime(process.env) },
});
