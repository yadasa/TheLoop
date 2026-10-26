const { resolveNativeRuntime } = require("../../scripts/native-config.cjs");
const { configureAndroid } = require("../../scripts/native-android-config.cjs");

module.exports = ({ config }) => {
  const runtime = resolveNativeRuntime(process.env);
  return {
    ...config,
    android: configureAndroid(config.android, runtime, process.env, __dirname),
    extra: { ...config.extra, theloop: runtime },
  };
};
