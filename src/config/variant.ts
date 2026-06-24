/**
 * LumeScan — App Variant Config
 * Reads the build variant (enterprise | consumer) from Expo Constants.
 * Set via APP_VARIANT env var in eas.json build profiles.
 */

import Constants from 'expo-constants';

export type AppVariant = 'enterprise' | 'consumer';

const variant: AppVariant =
  (Constants.expoConfig?.extra?.appVariant as AppVariant) || 'consumer';

export const IS_ENTERPRISE = variant === 'enterprise';
export const IS_CONSUMER = variant === 'consumer';

export default variant;
