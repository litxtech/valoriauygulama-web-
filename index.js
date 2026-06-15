/**
 * Entry point: Polyfill'ler HER ŞEYDEN ÖNCE yüklenmeli.
 * Hermes (iOS/Android) WeakRef desteklemediği için uygulama açılışında crash oluyordu.
 */
require('./lib/cryptoPolyfill');
require('./lib/weakRefPolyfill');
require('expo-router/entry');
