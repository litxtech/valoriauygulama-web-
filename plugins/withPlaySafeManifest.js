/**
 * Play / App Store: arka plan konum ve gereksiz manifest girdilerini temizler.
 * expo-location kütüphanesi LocationTaskService ekler; izin olmasa bile görünmesi incelemeyi zorlaştırır.
 */
const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

function stripLocationTaskServices(application) {
  if (!application?.service) return;
  const services = Array.isArray(application.service) ? application.service : [application.service];
  application.service = services.filter((service) => {
    const name = String(service?.$?.['android:name'] ?? '');
    return !name.includes('LocationTaskService');
  });
  if (application.service.length === 0) delete application.service;
}

module.exports = function withPlaySafeManifest(config) {
  config = withInfoPlist(config, (cfg) => {
    delete cfg.modResults.NSLocationAlwaysUsageDescription;
    delete cfg.modResults.NSLocationAlwaysAndWhenInUseUsageDescription;
    if (Array.isArray(cfg.modResults.UIBackgroundModes)) {
      cfg.modResults.UIBackgroundModes = cfg.modResults.UIBackgroundModes.filter((m) => m !== 'location');
    }
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) stripLocationTaskServices(app);
    return cfg;
  });

  return config;
};
