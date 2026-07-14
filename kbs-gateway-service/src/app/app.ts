import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { loadEnv } from '../config/env.js';
import { createLoggerOptions } from '../shared/logger/logger.js';
import { createSupabaseServerClient } from '../integrations/supabase/serverClient.js';
import { gatewayRoutes } from '../modules/gateway/gatewayRoutes.js';
import { detectEgressIpv4 } from '../shared/utils/egressIp.js';

declare module 'fastify' {
  interface FastifyInstance {
    env: ReturnType<typeof loadEnv>;
    supabase: ReturnType<typeof createSupabaseServerClient>;
  }
}

export function buildApp() {
  const env = loadEnv();
  const app = Fastify({ logger: createLoggerOptions(env) });
  app.decorate('env', env);
  app.decorate('supabase', createSupabaseServerClient(env));

  app.register(sensible);
  app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute' });

  app.get('/gateway/health', async () => ({
    ok: true,
    service: 'kbs-gateway-service',
    ts: new Date().toISOString()
  }));
  /** Bilgi amaçlı — sabit IP zorunlu değil; Yetkisiz IP teşhisi için. */
  app.get('/gateway/egress-ip', async () => {
    const egressIp = await detectEgressIpv4();
    return {
      ok: !!egressIp,
      service: 'kbs-gateway-service',
      egressIp,
      hint: egressIp
        ? `Jandarma sabit IP istemez. Yetkisiz IP alıyorsanız panelde kayıtlı IP varsa bu adresle değiştirin veya IP alanını boşaltın.`
        : 'Çıkış IP alınamadı; bir dakika sonra tekrar deneyin.'
    };
  });
  app.register(gatewayRoutes, { prefix: '/' });

  return app;
}

