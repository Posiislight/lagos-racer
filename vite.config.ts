import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** Real, paying ads only in a production build with VITE_ADS_LIVE=1; everywhere else the AdSense tag asks for placeholder ads. */
const adsenseTestMode = (): Plugin => {
  let live = false;
  return {
    name: 'adsense-test-mode',
    configResolved(config) {
      live = config.command === 'build' && config.mode === 'production' && loadEnv(config.mode, process.cwd(), 'VITE_').VITE_ADS_LIVE === '1';
    },
    transformIndexHtml: html => live ? html : html.replace('data-lagos-ads="1"', 'data-lagos-ads="1" data-adbreak-test="on"'),
  };
};

export default defineConfig({
  plugins: [
    react(),
    adsenseTestMode(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Lagos Racer',
        short_name: 'Lagos Racer',
        description: 'Race okadas, kekes, danfos and BRTs through Lagos.',
        theme_color: '#f5b400',
        background_color: '#141210',
        display: 'fullscreen',
        orientation: 'landscape',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  server: { host: true },
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three/')) return 'three';
          if (id.includes('@dimforge') || id.includes('@react-three/rapier')) return 'rapier';
          if (id.includes('@react-three/')) return 'r3f';
          return undefined;
        },
      },
    },
  },
});
