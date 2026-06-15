/**
 * Mobil cihazdan bağlanmak için Metro'yu LAN IP ile başlatır.
 * WEB AÇILMAZ – sadece telefonda Valoria (dev client) uygulaması kullanılır.
 *
 * Kullanım:
 *   npm start
 *   npm run start:dev:lan
 *
 * Önbellek temizlemek için:
 *   set EXPO_DEV_CLEAR=1 && npm start   (Windows)
 *   EXPO_DEV_CLEAR=1 npm start          (macOS/Linux)
 */
const os = require('os');
const { spawn } = require('child_process');

const DEV_SCHEME = 'exp+valoria-hotel';
const DEFAULT_PORT = process.env.RCT_METRO_PORT || process.env.EXPO_DEV_SERVER_PORT || '8081';

console.log('');
console.log('  >>>  Valoria Hotel – Dev server  <<<');
console.log('');

function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

function buildDevDeepLink(lanIp, port) {
  const metroUrl = encodeURIComponent(`http://${lanIp}:${port}`);
  return `${DEV_SCHEME}://expo-development-client/?url=${metroUrl}`;
}

const lanIp = getLanIp();
const port = String(DEFAULT_PORT);

if (!lanIp) {
  console.warn('  ⚠ LAN IP bulunamadı. Aynı Wi-Fi şart; gerekirse: npm run start:dev:tunnel');
  console.log('');
} else {
  const expUrl = `exp://${lanIp}:${port}`;
  const deepLink = buildDevDeepLink(lanIp, port);

  console.log('  Android (QR çalışmazsa — en güvenilir yol):');
  console.log('    1. Valoria uygulamasını aç');
  console.log('    2. "URL gir" alanına yapıştır:');
  console.log(`       ${expUrl}`);
  console.log('');
  console.log('  Android kamera QR Chrome açıyorsa:');
  console.log('    Yukarıdaki URL gir yöntemini kullanın (sistem kamerası exp+ linkini');
  console.log('    bazen tarayıcıya yönlendirir — bu Android 13+ bilinen davranış).');
  console.log('');
  console.log('  iOS: QR yok → Valoria → URL gir → yapıştır:');
  console.log(`    ${expUrl}`);
  console.log('');
  console.log('  Derin link (kopyala-yapıştır):');
  console.log(`    ${deepLink}`);
  console.log('');
}

const env = { ...process.env };
if (lanIp) {
  env.REACT_NATIVE_PACKAGER_HOSTNAME = lanIp;
}

const args = [
  'expo',
  'start',
  '--dev-client',
  '--host',
  'lan',
  '--port',
  port,
  '--scheme',
  DEV_SCHEME,
];

if (process.env.EXPO_DEV_CLEAR === '1') {
  args.push('--clear');
  console.log('  Önbellek temizlenerek başlatılıyor (EXPO_DEV_CLEAR=1).');
  console.log('');
}

const child = spawn('npx', args, { stdio: 'inherit', shell: true, env });
child.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
child.on('close', (code) => process.exit(code ?? 0));
