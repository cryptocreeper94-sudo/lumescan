/**
 * LumeScan — Dynamic Expo Config
 * Reads APP_VARIANT env var from EAS build profiles to switch between
 * Enterprise (restricted) and Consumer (public) builds from the same codebase.
 *
 * Enterprise build: eas build -p android --profile enterprise
 * Consumer build:   eas build -p android --profile consumer
 */

const IS_ENTERPRISE = process.env.APP_VARIANT === 'enterprise';

module.exports = () => {
  // Load the static app.json as the base
  const base = require('./app.json').expo;

  return {
    ...base,
    name: IS_ENTERPRISE ? 'LumeScan Enterprise' : 'LumeScan Pro',
    extra: {
      ...base.extra,
      appVariant: IS_ENTERPRISE ? 'enterprise' : 'consumer',
    },
  };
};
