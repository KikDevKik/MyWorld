import path from 'path';
import { renameSync } from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        headers: {
          "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
        },
      },
      plugins: [
        react(),
        tailwindcss(),
        {
          name: 'rename-index-to-app',
          closeBundle() {
            const distPath = './dist';
            try {
              renameSync(`${distPath}/index.html`, `${distPath}/app.html`);
              console.log('✓ dist/index.html → dist/app.html');
            } catch (e) {
              console.warn('Could not rename index.html to app.html:', e);
            }
          }
        }
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, 'src'),
        }
      },
      // Oct 2026: librerías grandes en archivos aparte. El navegador las guarda entre deploys
      // (solo cambia el código de MyWorld) y se descargan en paralelo.
      build: {
        rollupOptions: {
          output: {
            manualChunks(id: string) {
              if (!id.includes('node_modules')) return undefined;
              if (/node_modules\/(firebase|@firebase)\//.test(id)) return 'vendor-firebase';
              if (/node_modules\/(@codemirror|@lezer|codemirror)\//.test(id)) return 'vendor-editor';
              if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
              return undefined;
            },
          },
        },
      }
    };
});
