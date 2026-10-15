const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withUniwindConfig } = require('uniwind/metro');

// Expo's default config, plus the ids that match crash reports to their uploaded source maps
const config = getSentryExpoConfig(__dirname);

// withUniwindConfig must stay the outermost wrapper
module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
