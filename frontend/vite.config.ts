import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
// Import the package.json to get the version
import { readFileSync } from 'fs';

// Get package.json version
const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'));

// For runtime configuration, we'll always use relative paths
// BASE_PATH will be determined at runtime
const basePath = '';

// Dev only: where the vite dev server forwards API calls. MCPHUB_API_TARGET can
// come from the shell or from the repo-root .env (this config runs in frontend/).
const rootEnv = loadEnv('development', path.resolve(__dirname, '..'), '');
const apiTarget =
  process.env.MCPHUB_API_TARGET || rootEnv.MCPHUB_API_TARGET || 'http://localhost:3000';

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // Always use relative paths for runtime configuration
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    // Make package version available as global variable
    // BASE_PATH will be loaded at runtime
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(packageJson.version),
  },
  build: {
    sourcemap: true, // Enable source maps for production build
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/') ||
            id.includes('/react-router/') ||
            id.includes('/react-router-dom/') ||
            id.includes('/@remix-run/')
          ) {
            return 'framework-vendor';
          }

          if (
            id.includes('/i18next/') ||
            id.includes('/react-i18next/') ||
            id.includes('/i18next-browser-languagedetector/')
          ) {
            return 'i18n-vendor';
          }

          if (id.includes('/lucide-react/')) {
            return 'icons-vendor';
          }

          return undefined;
        },
      },
    },
  },
  server: {
    proxy: {
      [`${basePath}/api`]: {
        target: apiTarget,
        changeOrigin: true,
      },
      [`${basePath}/auth`]: {
        target: apiTarget,
        changeOrigin: true,
      },
      [`${basePath}/config`]: {
        target: apiTarget,
        changeOrigin: true,
      },
      [`${basePath}/public-config`]: {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
