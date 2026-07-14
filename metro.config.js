const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// Windows EMFILE: limit parallel transforms so Metro cache does not exhaust file handles.
config.maxWorkers = 2;

// @react-native-google-signin: ana index GoogleSigninButton üzerinden statics.js hatası veriyor.
// Sadece GoogleSignin API'sini yükle (buton yok).
const googleSigninPackageRoot = path.resolve(
  projectRoot,
  'node_modules/@react-native-google-signin/google-signin'
);
const googleSigninModulePath = path.join(
  googleSigninPackageRoot,
  'lib/module/signIn/GoogleSignin.js'
);

/** worklets-core "react-native" alanı src/index (.ts) gösterir; Metro bazen çözemez → derlenmiş JS. */
const workletsCoreEntry = path.join(
  projectRoot,
  'node_modules/react-native-worklets-core/lib/module/index.js'
);

const defaultResolveRequest = config.resolver.resolveRequest;

const ALIAS_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.json'];

/** tsconfig @/* — özel resolveRequest bazen yeni lib dosyalarını kaçırıyor (Windows/HMR). */
function resolveProjectAlias(moduleName) {
  if (!moduleName.startsWith('@/')) return null;
  const rel = moduleName.slice(2).replace(/\\/g, '/');
  const base = path.resolve(projectRoot, rel);
  for (const ext of ALIAS_EXTENSIONS) {
    const filePath = base + ext;
    if (fs.existsSync(filePath)) {
      return { filePath, type: 'sourceFile' };
    }
  }
  for (const ext of ALIAS_EXTENSIONS) {
    const filePath = path.join(base, `index${ext}`);
    if (fs.existsSync(filePath)) {
      return { filePath, type: 'sourceFile' };
    }
  }
  return null;
}

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
  const aliasHit = resolveProjectAlias(moduleName);
  if (aliasHit) return aliasHit;
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
