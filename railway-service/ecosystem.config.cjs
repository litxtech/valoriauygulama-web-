/**
 * Tek VPS (Hetzner) — iki Node süreci:
 * 1) valoria-kbs-ops    → dış kapı :4000 (Edge / mobil köprü)
 * 2) valoria-kbs-core   → iç SOAP :4001 (yalnız localhost; firewall ile dışarı kapatın)
 *
 * Önkoşul: `railway-service/.env` ve `../kbs-gateway-service/.env` dosyaları (örnek: .env.example).
 * Node 20+: --env-file=.env ile yüklenir. Ayrıntı: deploy/GATEWAY_PM2.md
 */
const path = require('path');

const opsRoot = __dirname;
const coreRoot = path.join(opsRoot, '..', 'kbs-gateway-service');

module.exports = {
  apps: [
    {
      name: 'valoria-kbs-core',
      cwd: coreRoot,
      script: 'dist/app/server.js',
      interpreter: 'node',
      interpreter_args: '--env-file=.env',
      env: {
        NODE_ENV: 'production',
        PORT: '4001',
      },
    },
    {
      name: 'valoria-kbs-ops',
      cwd: opsRoot,
      script: 'dist/app/server.js',
      interpreter: 'node',
      interpreter_args: '--env-file=.env',
      env: {
        NODE_ENV: 'production',
        PORT: '4000',
        /** İç gateway aynı makinede; dışarıya bu port yazılmaz. */
        GATEWAY_BASE_URL: 'http://127.0.0.1:4001',
      },
    },
  ],
};
