/**
 * Varsayılan: yerel Expo (dev-host).
 * VPS’te gateway’i bu repodan test etmek için: START_KBS_GATEWAY=1 npm start
 */
const { spawn } = require('child_process');

function run(cmd, args, opts) {
  const child = spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  child.on('error', (err) => {
    console.error(err);
    process.exit(1);
  });
  child.on('close', (code) => process.exit(code ?? 0));
}

if (process.env.START_KBS_GATEWAY === '1') {
  console.log('Starting KBS ops gateway (railway-service / dist)...');
  run('node', ['dist/app/server.js'], { cwd: 'railway-service' });
} else {
  run('node', ['scripts/dev-host.js']);
}
