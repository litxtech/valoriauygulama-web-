import type { FastifyPluginAsync } from 'fastify';
import { detectEgressIpv4 } from '../../shared/utils/egressIp.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    return { ok: true, service: 'valoria-kbs-gateway', ts: new Date().toISOString() };
  });

  /** Jandarma Yetkisiz IP için: Railway çıkış IPv4 (kbs-core ile aynı proje NAT). */
  app.get('/egress-ip', async () => {
    const egressIp = await detectEgressIpv4();
    return {
      ok: !!egressIp,
      service: 'valoria-kbs-gateway',
      egressIp,
      hint: egressIp
        ? `Bu IP’yi Jandarma KBS panelinde yetkili IP yapın veya IP listesini tamamen boşaltın. (Sabit IP şart değil.)`
        : 'Çıkış IP alınamadı; bir dakika sonra tekrar deneyin.'
    };
  });
};
