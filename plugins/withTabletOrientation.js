/**
 * Yalnızca Android tablet: cihaz döndürünce yatay mod (fullUser + resizeableActivity).
 * iPad: supportsTablet false + Info.plist — ayrı plugin yok.
 */
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

module.exports = function withTabletOrientation(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
    mainActivity.$['android:screenOrientation'] = 'fullUser';
    mainActivity.$['android:resizeableActivity'] = 'true';
    return cfg;
  });
};
