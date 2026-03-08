import Constants from 'expo-constants';
import { resolveWebSocketUrl } from '@gelehka/game-core/network';

interface ExpoExtraConfig {
  environment?: string;
  wsUrl?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as ExpoExtraConfig;
const explicitWsUrl = process.env.EXPO_PUBLIC_WS_URL ?? extra.wsUrl ?? '';
const environment = process.env.EXPO_PUBLIC_APP_ENV ?? extra.environment ?? 'development';

export const runtimeConfig = {
  environment,
  wsUrl: explicitWsUrl ? resolveWebSocketUrl({ explicitUrl: explicitWsUrl }) : '',
};
