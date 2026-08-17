/**
 * Entry point: Polyfill'ler HER ŞEYDEN ÖNCE yüklenmeli.
 * Hermes (iOS/Android) WeakRef desteklemediği için uygulama açılışında crash oluyordu.
 */
require('./lib/cryptoPolyfill');
require('./lib/weakRefPolyfill');

/** LiveKit WebRTC globals — native only (Expo Go desteklemez; dev/production client gerekir). */
try {
  const { Platform } = require('react-native');
  if (Platform.OS !== 'web') {
    const { registerGlobals } = require('@livekit/react-native');
    registerGlobals();
  }
} catch {
  /* web / native modül henüz yok */
}

require('expo-router/entry');
