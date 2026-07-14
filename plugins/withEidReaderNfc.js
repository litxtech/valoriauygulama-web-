/**
 * @2060.io/react-native-eid-reader — ePasaport NFC (ICAO 9303).
 * iOS: NFC Tag Reading + ISO7816 AID'ler (react-native-nfc-manager ile birleşir).
 * Android/iOS: tam MRZ ve eksik çip alanları için küçük native yamalar.
 */
const { withInfoPlist, withEntitlementsPlist, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const ISO_AIDS = ['A0000002471001', 'A0000002472001', '00000000000000'];

function addUnique(arr, values) {
  const out = Array.isArray(arr) ? [...arr] : [];
  for (const v of values) {
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function applyEidReaderPatches(projectRoot) {
  require(path.join(projectRoot, 'scripts/patch-eid-reader-nfc.js'));
}

function patchAndroidEIdReader(projectRoot) {
  applyEidReaderPatches(projectRoot);
}

function patchIosEIdReader(projectRoot) {
  applyEidReaderPatches(projectRoot);
}

module.exports = function withEidReaderNfc(config) {
  config = withInfoPlist(config, (cfg) => {
    if (!cfg.modResults.NFCReaderUsageDescription) {
      cfg.modResults.NFCReaderUsageDescription =
        'Pasaport çipi okuma ve kapı etiketi için NFC kullanılır.';
    }
    const key = 'com.apple.developer.nfc.readersession.iso7816.select-identifiers';
    cfg.modResults[key] = addUnique(cfg.modResults[key], ISO_AIDS);
    return cfg;
  });

  config = withEntitlementsPlist(config, (cfg) => {
    const key = 'com.apple.developer.nfc.readersession.formats';
    cfg.modResults[key] = addUnique(cfg.modResults[key], ['TAG']);
    return cfg;
  });

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      patchAndroidEIdReader(cfg.modRequest.projectRoot);
      return cfg;
    },
  ]);

  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      patchIosEIdReader(cfg.modRequest.projectRoot);
      return cfg;
    },
  ]);

  return config;
};
