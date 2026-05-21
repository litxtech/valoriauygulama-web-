import { buildApp } from './app.js';
import { resolveListenPort } from '../config/env.js';

async function main() {
  const app = buildApp();
  const port = resolveListenPort(app.env.PORT);
  const host = '0.0.0.0';
  await app.listen({ port, host });
  // eslint-disable-next-line no-console
  console.log(`[kbs-ops] listening on ${host}:${port} (pid ${process.pid})`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[kbs-ops] startup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

