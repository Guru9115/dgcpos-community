import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'net.dgcpos.app',
  appName: 'DGC POS',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: ['api.dgcpos.net', '*.dgcpos.net'],
    /* SPA fallback when WKWebView reloads after GPU/process crash */
    errorPath: 'index.html',
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
    backgroundColor: '#F6F9FC',
    /* Full iPad screen (not iPhone compatibility window) */
    preferredContentMode: 'fullscreen',
  },
  android: {
    allowMixedContent: false,
    /* Phones + tablets — responsive WebView */
    adjustMarginsForEdgeToEdge: 'auto',
  },
  plugins: {
    // Native HTTP bypasses WKWebView CORS — required for api.dgcpos.net from iOS/Android shell
    CapacitorHttp: {
      enabled: false,
    },
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false,
      backgroundColor: '#F6F9FC',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#F6F9FC',
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
}

export default config