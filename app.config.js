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
  version: '2.2.9',
  orientation: 'portrait',
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
    buildNumber: '16',
    newArchEnabled: true,
    infoPlist: {
      NSCameraUsageDescription: 'Sözleşme onayı için QR kod okutmanız gerekiyor.',
      NSPhotoLibraryUsageDescription: 'Profil ve belge yükleme için galeri erişimi.',
      NSLocationWhenInUseUsageDescription: 'Uygulama açıkken oteli haritada göstermek ve size yaklaştığınızda check-in için kolaylık sunmak üzere konum kullanılır.',
      NSMicrophoneUsageDescription: 'Sesli mesaj kaydi icin mikrofon erisimi gerekir.',
      NSLocalNetworkUsageDescription: 'Güvenlik kameralarını canlı izlemek ve geliştirme sunucusuna bağlanmak için yerel ağ erişimi gerekir.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    newArchEnabled: true,
    versionCode: 17,
    softwareKeyboardLayoutMode: 'resize',
    ...(easPlatform === 'ios' ? {} : { googleServicesFile }),
    adaptiveIcon: {
      // Keep logo inside Android adaptive icon safe zone.
      foregroundImage: './assets/adaptive-icon-foreground.png',
      backgroundColor: '#0c1222',
    },
    package: 'com.valoria.hotel',
    permissions: [
      'android.permission.CAMERA',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.RECORD_AUDIO',
      'android.permission.NFC',
      // Android 13+ (API 33): bildirim izni manifest’te tanımlı olmalı
      'android.permission.POST_NOTIFICATIONS',
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
    'expo-location',
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
      },
    ],
    'expo-font',
    'expo-localization',
    [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme: 'com.googleusercontent.apps.47373050426-8men09t0m35sufet2n6nl21r4oq07gfo',
      },
    ],
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
    router: { origin: 'https://valoriahotel-el4r.vercel.app' },
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
