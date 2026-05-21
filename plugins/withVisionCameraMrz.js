/**
 * VisionCamera + ML Kit (yalnızca Latin metin tanıma) — MRZ canlı tarama.
 */
const { withProjectBuildGradle, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MLKIT_MARKER = 'react-native-vision-camera-mlkit';

const gradleExt = `
// MRZ: yalnızca Latin OCR (APK boyutu)
ext["react-native-vision-camera-mlkit"] = [
  mlkit: [
    textRecognition: true,
    textRecognitionChinese: false,
    textRecognitionDevanagari: false,
    textRecognitionJapanese: false,
    textRecognitionKorean: false,
    faceDetection: false,
    faceMeshDetection: false,
    poseDetection: false,
    barcodeScanning: false,
    imageLabeling: false,
    objectDetection: false,
  ]
]
`;

function withMlkitGradleExt(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (mod.contents.includes(MLKIT_MARKER)) return mod;
    mod.contents = mod.contents.replace(/buildscript\s*\{/, `buildscript {${gradleExt}`);
    return mod;
  });
}

function withMlkitPodfile(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return cfg;
      let contents = fs.readFileSync(podfilePath, 'utf8');
      if (contents.includes('$VisionCameraMLKit')) return cfg;
      const header = `$VisionCameraMLKit = {
  'textRecognition' => true,
  'faceDetection' => false,
  'barcodeScanning' => false,
}

`;
      fs.writeFileSync(podfilePath, header + contents);
      return cfg;
    },
  ]);
}

module.exports = function withVisionCameraMrz(config) {
  config = withMlkitGradleExt(config);
  config = withMlkitPodfile(config);
  return config;
};
