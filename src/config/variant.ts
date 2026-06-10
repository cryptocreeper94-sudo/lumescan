/**
 * LumeScan — App Variant Config
 * Reads the build variant (cox | consumer) from Expo Constants.
 * Set via APP_VARIANT env var in eas.json build profiles.
 */

import Constants from 'expo-constants';

export type AppVariant = 'cox' | 'consumer';

const variant: AppVariant =
  (Constants.expoConfig?.extra?.appVariant as AppVariant) || 'consumer';

export const IS_COX = variant === 'cox';
export const IS_CONSUMER = variant === 'consumer';

export default variant;
