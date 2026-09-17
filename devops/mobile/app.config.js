// Dynamic Expo config — one build pipeline, three environments.
// Secrets are NEVER inlined here. Only public (client-safe) values are read from
// EXPO_PUBLIC_* env vars, surfaced per-profile in eas.json -> build.<profile>.env
// and per-channel in EAS environment variables for OTA updates.

const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV || 'development';

const APP_NAMES = {
  development: 'Photobooth (Dev)',
  staging: 'Photobooth (QA)',
  production: 'Photobooth'
};

const BUNDLE_IDS = {
  development: 'com.yourbrand.photobooth.dev',
  staging: 'com.yourbrand.photobooth.staging',
  production: 'com.yourbrand.photobooth'
};

const HOSTING_URLS = {
  development: 'https://photobooth-admin-dev.web.app',
  staging: 'https://photobooth-admin-staging.web.app',
  production: 'https://admin.photobooth.example'
};

module.exports = ({ config }) => ({
  ...config,
  name: APP_NAMES[APP_ENV] || APP_NAMES.production,
  slug: 'photobooth-app',
  version: config.version,
  runtimeVersion: { policy: 'appVersion' }, // OTA updates only reach compatible binaries
  scheme: 'photoboothapp',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  // Channels are set per EAS profile so OTA never crosses environments
  updates: {
    url: process.env.EXPO_UPDATE_URL || 'https://u.expo.dev/REPLACE_WITH_EAS_PROJECT_ID',
    fallbackToCacheTimeout: 0,
    checkAutomatically: 'ON_LOAD'
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: BUNDLE_IDS[APP_ENV],
    buildNumber: '1',
    infoPlist: {
      NSCameraUsageDescription: 'Kailangan ang camera para makakuha ng litrato sa photobooth.',
      NSPhotoLibraryUsageDescription: 'Kailangan ang photo library para i-save ang mga litrato.',
      NSPhotoLibraryAddUsageDescription: 'Para mai-save ang mga edited na litrato sa gallery mo.'
    }
  },
  android: {
    package: BUNDLE_IDS[APP_ENV],
    versionCode: 1,
    permissions: ['CAMERA'],
    blockedPermissions: ['RECORD_AUDIO'],
    googleServicesFile: `./google-services.${APP_ENV}.json`
  },
  plugins: [
    'expo-camera',
    'expo-image-picker',
    [
      'expo-build-properties',
      { android: { minSdkVersion: 24, compileSdkVersion: 34 }, ios: { deploymentTarget: '15.1' } }
    ]
  ],
  extra: {
    appEnv: APP_ENV,
    eas: { projectId: 'REPLACE_WITH_EAS_PROJECT_ID' },
    adminPanelUrl: HOSTING_URLS[APP_ENV],
    // Read by the app at runtime; no secrets here — API keys for AI live in Cloud Functions
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
  }
});