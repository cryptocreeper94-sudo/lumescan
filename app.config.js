/**
 * LumeScan — Dynamic Expo Config
 * Reads APP_VARIANT env var from EAS build profiles to switch between
 * Cox (enterprise) and Consumer (public) builds from the same codebase.
 *
 * Cox build:      eas build -p android --profile cox
 * Consumer build: eas build -p android --profile consumer
 */

const IS_COX = process.env.APP_VARIANT === 'cox';

module.exports = () => {
  // Load the static app.json as the base
  const base = require('./app.json').expo;

  return {
    ...base,
    name: IS_COX ? 'Lume Scan · Cox' : 'LumeScan Pro',
    extra: {
      ...base.extra,
      appVariant: IS_COX ? 'cox' : 'consumer',
    },
  };
};
