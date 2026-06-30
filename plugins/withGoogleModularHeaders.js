/**
 * AppCheckCore (Google Sign-In / Firebase) static pod install fix.
 * Swift pods need module maps for GoogleUtilities and RecaptchaInterop.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = 'GoogleUtilities modular headers';

function withGoogleModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return cfg;

      let contents = fs.readFileSync(podfilePath, 'utf8');
      if (contents.includes(MARKER)) return cfg;

      const insert = `
  # ${MARKER} (AppCheckCore / Google Sign-In)
  pod 'GoogleUtilities', :modular_headers => true
  pod 'RecaptchaInterop', :modular_headers => true
`;

      if (contents.includes('use_expo_modules!')) {
        contents = contents.replace(/use_expo_modules!\s*\n/, `use_expo_modules!\n${insert}\n`);
      } else {
        contents = insert + '\n' + contents;
      }

      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
}

module.exports = withGoogleModularHeaders;
