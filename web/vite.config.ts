import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * The dev server proxies /api to the Express process, so the client uses
 * same-origin relative URLs in development exactly as it does in production
 * (where Express serves the built bundle). That removes CORS from the picture
 * entirely and means no URL rewriting between environments.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');

  // Where the dev proxy forwards /api.
  //
  // Deliberately NOT derived from a bare `PORT`: loadEnv merges the ambient
  // environment, and plenty of dev harnesses (and Vite itself) already export
  // PORT for the *frontend*, which would make the API proxy point at itself.
  // Precedence: explicit override -> the API's public URL -> the default.
  //
  // 127.0.0.1 rather than "localhost" is also deliberate. On Windows localhost
  // resolves to both ::1 and 127.0.0.1; Node's happy-eyeballs connector races
  // the two and can fail the request outright with EADDRINUSE.
  const apiPort = (() => {
    if (env.VITE_API_PROXY_PORT) return env.VITE_API_PROXY_PORT;
    const fromUrl = /:(\d+)/.exec(env.API_PUBLIC_URL ?? '')?.[1];
    return fromUrl ?? '4000';
  })();

  const apiTarget = `http://127.0.0.1:${apiPort}`;

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
    preview: { port: 4173 },
    build: {
      // Emitted straight into the server workspace so `npm start` serves the
      // API and the client from one process on one free-tier dyno.
      outDir: path.resolve(__dirname, '../server/public'),
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
            motion: ['framer-motion'],
          },
        },
      },
    },
  };
});
