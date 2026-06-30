const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Windows EMFILE: limit parallel transforms so Metro cache does not exhaust file handles.
config.maxWorkers = 2;

// @react-native-google-signin: ana index GoogleSigninButton üzerinden statics.js hatası veriyor.
// Sadece GoogleSignin API'sini yükle (buton yok).
const googleSigninPackageRoot = path.resolve(
  __dirname,
  'node_modules/@react-native-google-signin/google-signin'
);
const googleSigninModulePath = path.join(
  googleSigninPackageRoot,
  'lib/module/signIn/GoogleSignin.js'
);

/** worklets-core "react-native" alanı src/index (.ts) gösterir; Metro bazen çözemez → derlenmiş JS. */
const workletsCoreEntry = path.join(
  __dirname,
  'node_modules/react-native-worklets-core/lib/module/index.js'
);

const defaultResolveRequest = config.resolver.resolveRequest;

// npm geçici @expo/.cli-* klasörleri silinince Metro ENOENT ile çökebiliyor (Windows).
const expoCliTempBlock = /[\\/]node_modules[\\/]@expo[\\/]\.cli-[^\\/]+([\\/]|$)/;

config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  expoCliTempBlock,
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@react-native-google-signin/google-signin') {
    return { filePath: googleSigninModulePath, type: 'sourceFile' };
  }
  if (moduleName === 'react-native-worklets-core') {
    return { filePath: workletsCoreEntry, type: 'sourceFile' };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
