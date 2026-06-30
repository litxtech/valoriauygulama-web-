const { withBuildProperties } = require('expo-build-properties');

const devClientScheme = 'exp+valoria-hotel';

/** EAS Build: preview/production → Apple production APNs; development client → sandbox */
const easProfile = process.env.EAS_BUILD_PROFILE;
const expoPushIosMode =
  easProfile === 'production' || easProfile === 'preview' ? 'production' : 'development';
const easPlatform = process.env.EAS_BUILD_PLATFORM;
const googleServicesFile =
  process.env.GOOGLE_SERVICES_JSON || './google-services.json';

const baseConfig = {
  name: 'Valoria',
  slug: 'valoria-hotel',
  version: '2.2.21',
  /** Android tablet: döner; iPad kapalı (supportsTablet false). Bkz. withTabletOrientation.js */
  orientation: 'default',
  icon: './assets/icon.png',
  scheme: 'valoria',
  userInterfaceStyle: 'automatic',
  /** Reanimated 4.x + react-native-worklets: New Architecture zorunlu (RNReanimated.podspec). */
  newArchEnabled: true,
  splash: {
    image: './assets/splash-empty.png',
    resizeMode: 'contain',
    backgroundColor: '#1a365d',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.valoria.hotel',
    buildNumber: '28',
    newArchEnabled: true,
    infoPlist: {
      /** iPad’de yalnızca dikey (telefon uyumluluk penceresi); tablet UI yok */
      'UISupportedInterfaceOrientations~ipad': ['UIInterfaceOrientationPortrait'],
      UIBackgroundModes: ['remote-notification'],
      NSCameraUsageDescription:
        'Pasaport/kimlik MRZ canlı okuma, barkod ve belge taraması için kamera kullanılır.',
      NSPhotoLibraryUsageDescription: 'Profil ve belge yükleme için galeri erişimi.',
      NSLocationWhenInUseUsageDescription:
        'Haritada yol tarifi, yakın noktalar ve (açarsanız) konum paylaşımı için yalnızca uygulama kullanılırken konum alınır.',
      NSMicrophoneUsageDescription: 'Sesli mesaj kaydi icin mikrofon erisimi gerekir.',
      NSLocalNetworkUsageDescription: 'Güvenlik kameralarını canlı izlemek ve geliştirme sunucusuna bağlanmak için yerel ağ erişimi gerekir.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  /** SDK 54+: sistem gezinme çubuğu / edge-to-edge (kontrast + inset uyumu) */
  androidNavigationBar: {
    enforceContrast: true,
  },
  android: {
    newArchEnabled: true,
    /** SDK 54 / target 35+: edge-to-edge; statusBarColor gibi eski API kullanmayın. */
    edgeToEdgeEnabled: true,
    versionCode: 29,
    softwareKeyboardLayoutMode: 'resize',
    ...(easPlatform === 'ios' ? {} : { googleServicesFile }),
    adaptiveIcon: {
      // Keep logo inside Android adaptive icon safe zone.
      foregroundImage: './assets/adaptive-icon-foreground.png',
      backgroundColor: '#0c1222',
    },
    package: 'com.valoria.hotel',
    /**
     * İzinler çoğunlukla expo-camera / expo-location / expo-image-picker / expo-notifications
     * plugin’lerinden gelir; burada yalnızca ek paketler (NFC) listelenir.
     */
    permissions: ['android.permission.NFC'],
    /**
     * Bağımlılıkların manifest’e eklediği gereksiz / riskli izinleri kesin olarak engelle.
     * Play Console’da görünmeleri bile inceleme ve Data safety sorununa yol açabilir.
     */
    blockedPermissions: [
      // Galeri — Android Photo Picker; READ_MEDIA_* ve legacy storage yok
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.ACCESS_MEDIA_LOCATION',
      // Konum — yalnızca uygulama açıkken (foreground)
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
    ],
    /** Dev client QR (exp+valoria-hotel) — kamera QR okutunca Chrome yerine uygulama açılsın */
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: false,
        data: [{ scheme: 'exp+valoria-hotel' }, { scheme: 'valoria' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: [
    [
      'expo-dev-client',
      {
        launchMode: 'launcher',
        addGeneratedScheme: true,
      },
    ],
    'expo-router',
    [
      'expo-camera',
      {
        cameraPermission: 'Stok barkodu okutmak için kamera gerekir.',
        barcodeScannerEnabled: true,
      },
    ],
    [
      'react-native-vision-camera',
      {
        cameraPermissionText:
          'Pasaport ve kimlik MRZ alanını canlı okumak için kamera kullanılır; fotoğraf galeriye kaydedilmez.',
        enableMicrophonePermission: false,
      },
    ],
    './plugins/withVisionCameraMrz.js',
    './plugins/withTabletOrientation.js',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Haritada yol tarifi, yakın noktalar ve (açarsanız) konum paylaşımı için yalnızca uygulama kullanılırken konum alınır.',
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Profil fotoğrafı, belge, stok faturası, görev ve sohbet ekleri için galeriden seçim yapılır.',
        cameraPermission: 'Barkod, belge ve fotoğraf çekmek için kamera kullanılır.',
        microphonePermission:
          'Gönderi ve sohbette video kaydı için mikrofon kullanılır (yalnızca siz kayıt başlattığınızda).',
      },
    ],
    'expo-apple-authentication',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-empty.png',
        resizeMode: 'contain',
        backgroundColor: '#1a365d',
        imageWidth: 1,
        android: { imageWidth: 1, backgroundColor: '#1a365d' },
        ios: { backgroundColor: '#1a365d' },
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/icon.png',
        color: '#1a365d',
        androidMode: 'default',
        androidCollapsedTitle: 'Valoria',
        defaultChannelId: 'valoria_urgent',
        defaultChannel: 'valoria_urgent',
        mode: expoPushIosMode,
        enableBackgroundRemoteNotifications: true,
        /**
         * Özellik bazlı varsayılan bildirim sesleri (Android raw + iOS bundle).
         * Üretim: scripts/generate_notification_sounds.py
         * Değişiklik sonrası yeni native build (EAS) gerekir.
         */
        sounds: [
          './assets/sounds/emergency_alert.wav',
          './assets/sounds/task_ping.wav',
          './assets/sounds/meal_chime.wav',
          './assets/sounds/salary_cash.wav',
          './assets/sounds/warning_alert.wav',
          './assets/sounds/kbs_scan.wav',
          './assets/sounds/message_pop.wav',
        ],
      },
    ],
    'expo-font',
    'expo-localization',
    [
      'expo-av',
      {
        microphonePermission: 'Sesli mesaj kaydı için mikrofon kullanılır.',
      },
    ],
    [
      'react-native-share',
      {
        ios: ['whatsapp'],
        android: ['com.whatsapp'],
      },
    ],
    [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme: 'com.googleusercontent.apps.47373050426-8men09t0m35sufet2n6nl21r4oq07gfo',
      },
    ],
    './plugins/withPlaySafeManifest.js',
    './plugins/withGoogleModularHeaders.js',
  ],
  experiments: {
    typedRoutes: true,
  },
  /** Expo Push: sistem tepsi / ön plan davranışı (ek olarak expo-notifications plugin ile uyumlu) */
  notification: {
    icon: './assets/icon.png',
    color: '#1a365d',
    androidMode: 'default',
    androidCollapsedTitle: 'Valoria',
    iosDisplayInForeground: true,
  },
  extra: {
    router: { origin: process.env.EXPO_PUBLIC_APP_URL || 'https://valoria.tr' },
    eas: { projectId: 'b6913ae8-bafd-4899-96bc-ae995a4bcec1' },
    devClientScheme,
    public: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      /** KBS sekmesi + admin KBS menüleri; ayrıca EXPO_PUBLIC_KBS_UI_ENABLED env */
      kbsUiEnabled: process.env.EXPO_PUBLIC_KBS_UI_ENABLED,
    },
  },
  owner: 'valoriahotel',
};

const expoWithBuild = withBuildProperties(
  baseConfig,
  {
    ios: {
      deploymentTarget: '16.0',
    },
    android: {
      kotlinVersion: '2.0.21',
      /** react-native-vlc-media-player requires minSdk 26+ */
      minSdkVersion: 26,
    },
  }
);

module.exports = { expo: expoWithBuild };
