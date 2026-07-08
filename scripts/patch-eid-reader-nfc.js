/**
 * @2060.io/react-native-eid-reader — tam MRZ + iOS expiryDate + Xcode 26.2 NFC API yamaları.
 * npm postinstall ve EAS prebuild öncesi çalışır.
 *
 * PassportReader.swift iOS 26.4 / Xcode 26.4 NFCTagReaderSession.Configuration kullanır;
 * EAS SDK 54 image (Xcode 26.2) bu tipi bilmediği için #available bloğu bile derlenmez.
 * Eski pollingOption initializer’a düşürürüz (pasaport BAC için yeterli).
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

function patchIosExpiryDate(root) {
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

/** Xcode 26.2: Configuration / .pace API’sini kaldır — yalnız iso14443 polling. */
function patchIosPassportReaderForXcode262(root) {
  const swiftPath = path.join(
    root,
    'node_modules/@2060.io/react-native-eid-reader/ios/NFCPassportReader/PassportReader.swift'
  );
  if (!fs.existsSync(swiftPath)) return false;
  let src = fs.readFileSync(swiftPath, 'utf8');
  if (src.includes('EAS_XCODE_262_NFC_PATCH')) return false;
  if (!src.includes('NFCTagReaderSession.Configuration')) return false;

  const broken = `        if NFCTagReaderSession.readingAvailable {
            // iOS 26.4+ provides a Configuration-based initializer that
            // correctly handles combined \`.iso14443\` + \`.pace\` polling,
            // supporting both standard passports (BAC) and eIDs that
            // require PACE-aware polling (e.g. French CNIe).
            // On older iOS, fall back to \`.iso14443\` only.
            if #available(iOS 26.4, *) {
                let config = NFCTagReaderSession.Configuration(
                    pollingOption: [.iso14443, .pace],
                    iso7816SelectIdentifiers: [],
                    feliCaSystemCodes: []
                )
                readerSession = NFCTagReaderSession(configuration: config, delegate: self, queue: nil)
            } else {
                readerSession = NFCTagReaderSession(pollingOption: [.iso14443], delegate: self, queue: nil)
            }
            
            self.updateReaderSessionMessage( alertMessage: NFCViewDisplayMessage.requestPresentPassport(labels?["requestPresentPassport"] as? String))
            readerSession?.begin()
        }`;

  const fixed = `        if NFCTagReaderSession.readingAvailable {
            // EAS_XCODE_262_NFC_PATCH: Xcode 26.2 SDK has no Configuration / .pace;
            // keep BAC-compatible iso14443 polling for ePassport.
            readerSession = NFCTagReaderSession(pollingOption: [.iso14443], delegate: self, queue: nil)
            
            self.updateReaderSessionMessage( alertMessage: NFCViewDisplayMessage.requestPresentPassport(labels?["requestPresentPassport"] as? String))
            readerSession?.begin()
        }`;

  if (!src.includes(broken)) {
    // Whitespace-tolerant fallback: strip the 26.4 branch by regex.
    const re =
      /if NFCTagReaderSession\.readingAvailable \{\s*\/\/ iOS 26\.4\+[\s\S]*?readerSession = NFCTagReaderSession\(pollingOption: \[\\.iso14443\], delegate: self, queue: nil\)\s*\}\s*self\.updateReaderSessionMessage/;
    if (!re.test(src) && !src.includes('NFCTagReaderSession.Configuration')) return false;
    if (src.includes('NFCTagReaderSession.Configuration')) {
      src = src.replace(
        /if NFCTagReaderSession\.readingAvailable \{[\s\S]*?readerSession\?\.begin\(\)\s*\}/,
        `if NFCTagReaderSession.readingAvailable {
            // EAS_XCODE_262_NFC_PATCH: Xcode 26.2 SDK has no Configuration / .pace;
            // keep BAC-compatible iso14443 polling for ePassport.
            readerSession = NFCTagReaderSession(pollingOption: [.iso14443], delegate: self, queue: nil)
            
            self.updateReaderSessionMessage( alertMessage: NFCViewDisplayMessage.requestPresentPassport(labels?["requestPresentPassport"] as? String))
            readerSession?.begin()
        }`
      );
      if (!src.includes('EAS_XCODE_262_NFC_PATCH')) return false;
      fs.writeFileSync(swiftPath, src);
      return true;
    }
    return false;
  }

  fs.writeFileSync(swiftPath, src.replace(broken, fixed));
  return true;
}

function patchIosEIdReader(root) {
  const expiry = patchIosExpiryDate(root);
  const reader = patchIosPassportReaderForXcode262(root);
  return expiry || reader;
}

const android = patchAndroidEIdReader(projectRoot);
const ios = patchIosEIdReader(projectRoot);
if (android || ios) {
  console.log(`[patch-eid-reader-nfc] applied: android=${android} ios=${ios}`);
}
