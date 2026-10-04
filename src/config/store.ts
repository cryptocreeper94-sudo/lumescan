/**
 * LumeScan — Store / distribution rules
 *
 * Google Play does not allow apps to send users to an outside website to
 * pay for in-app features. In the Play Store build, "Upgrade" buttons
 * explain Pro instead of linking out. Users who bought Pro elsewhere
 * (website / dongle kit) still sign in and are unlocked via entitlements.
 */

import { Alert, Linking } from 'react-native';
import Constants from 'expo-constants';

export const ORDER_URL = 'https://lumeauto.tech/order';

export const PLAY_STORE_BUILD =
  ((Constants.expoConfig?.extra?.distribution as string | undefined) ?? 'playstore') === 'playstore';

export function openUpgrade(): void {
  if (PLAY_STORE_BUILD) {
    Alert.alert(
      'LumeScan Pro',
      'This feature is part of LumeScan Pro.\n\nAlready have Pro? Sign in with the same email you used and it unlocks automatically.'
    );
    return;
  }
  Linking.openURL(ORDER_URL);
}
