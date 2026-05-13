/**
 * Stream Android device logs to your terminal (no copy/paste from Metro UI).
 *
 * Usage:
 *   npm run log:android
 *   npm run log:android -- --keywords "Valoria,AdminLayout,AdminDashboard"
 *
 * Requires `adb` on PATH (Android Platform Tools).
 */
const { spawn } = require('node:child_process');

function parseArg(name, argv) {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  return argv[idx + 1] ?? null;
}

function splitKeywords(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const argv = process.argv.slice(2);
const keywordsRaw = parseArg('--keywords', argv);
const defaultKeywords = ['Valoria', 'AdminLayout', 'AdminDashboard', 'authStore', 'SurfaceMountingManager', 'AndroidRuntime'];
const keywords = keywordsRaw ? splitKeywords(keywordsRaw) : defaultKeywords;

const adbArgs = ['logcat', '-v', 'time'];

const child = spawn('adb', adbArgs, {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
  windowsHide: true,
});

// NOTE: On Windows, spawn failures may surface asynchronously via 'error'.
// Never exit early based on pid alone (can be undefined briefly / on failure).
child.on('error', (err) => {
  // Typical case: adb not installed / not on PATH
  // eslint-disable-next-line no-console
  console.error('[android-log] adb başlatılamadı:', err?.message ?? err);
  // eslint-disable-next-line no-console
  console.error('[android-log] Android Platform Tools kurulu olmalı ve `adb` PATH’te olmalı.');
  process.exit(1);
});

// eslint-disable-next-line no-console
console.log(`[android-log] adb ${adbArgs.join(' ')}`);
// eslint-disable-next-line no-console
console.log(`[android-log] filtre anahtarları: ${keywords.join(', ')}`);
// eslint-disable-next-line no-console
console.log('[android-log] durdurmak için Ctrl+C');

function shouldPrint(line) {
  const s = String(line);
  for (const k of keywords) {
    if (k && s.includes(k)) return true;
  }
  return false;
}

function attach(stream, label) {
  let buf = '';
  stream.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    const parts = buf.split(/\r?\n/);
    buf = parts.pop() ?? '';
    for (const line of parts) {
      if (!line) continue;
      if (!shouldPrint(line)) continue;
      // eslint-disable-next-line no-console
      console.log(label ? `${label}${line}` : line);
    }
  });
}

attach(child.stdout, '');
attach(child.stderr, '[adb stderr] ');

function shutdown(code) {
  try {
    child.kill('SIGINT');
  } catch {
    // ignore
  }
  process.exit(code ?? 0);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

child.on('close', (code) => {
  // eslint-disable-next-line no-console
  console.log(`[android-log] adb kapandı (code=${code ?? 'unknown'})`);
  process.exit(code ?? 0);
});
