/**
 * @2060.io/react-native-eid-reader — tam MRZ + iOS expiryDate yamaları.
 * npm postinstall ve EAS prebuild öncesi çalışır.
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function patchAndroidEIdReader(root) {
  const ktPath = path.join(
    root,
    'node_modules/@2060.io/react-native-eid-reader/android/src/main/java/io/twentysixty/rn/eidreader/EIdReader.kt'
  );
  if (!fs.existsSync(ktPath)) return false;
  let src = fs.readFileSync(ktPath, 'utf8');
  if (src.includes('lines.take(3).joinToString')) return false;

  const broken =
    'nfcResult.mrz =\n      "${mrzInfo.documentNumber}${mrzInfo.dateOfExpiry}${mrzInfo.dateOfBirth}"';
  const fixed = `nfcResult.mrz = run {
      val ascii = String(dg1RawBytes, Charsets.ISO_8859_1)
      val lines = ascii.split(Regex("[\\\\r\\\\n]+"))
        .map { it.trim() }
        .filter { it.length in 30..46 && it.all { c -> c in 'A'..'Z' || c in '0'..'9' || c == '<' } }
      when {
        lines.size >= 2 -> lines.take(3).joinToString("\\n")
        else -> "\${mrzInfo.documentNumber}\${mrzInfo.dateOfExpiry}\${mrzInfo.dateOfBirth}"
      }
    }`;

  if (!src.includes(broken)) return false;
  fs.writeFileSync(ktPath, src.replace(broken, fixed));
  return true;
}

function patchIosEIdReader(root) {
  const swiftPath = path.join(root, 'node_modules/@2060.io/react-native-eid-reader/ios/EidReader.swift');
  if (!fs.existsSync(swiftPath)) return false;
  let src = fs.readFileSync(swiftPath, 'utf8');
  if (src.includes('data["expiryDate"] = passport.documentExpiryDate')) return false;

  const needle = 'data["nationality"] = passport.nationality';
  const insert = `data["expiryDate"] = passport.documentExpiryDate
        data["nationality"] = passport.nationality`;
  if (!src.includes(needle)) return false;
  fs.writeFileSync(swiftPath, src.replace(needle, insert));
  return true;
}

const android = patchAndroidEIdReader(projectRoot);
const ios = patchIosEIdReader(projectRoot);
if (android || ios) {
  console.log(`[patch-eid-reader-nfc] applied: android=${android} ios=${ios}`);
}
