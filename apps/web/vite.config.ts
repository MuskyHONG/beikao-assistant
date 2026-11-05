import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const version = readFileSync(new URL('../../VERSION', import.meta.url), 'utf8').trim();
export default defineConfig(({mode}) => {
  const env = loadEnv(mode, fileURLToPath(new URL('../../', import.meta.url)), ['PORT','WEB_DEV_PORT']);
  const apiPort = Number(env.PORT ?? 43127), webPort = Number(env.WEB_DEV_PORT ?? 43126);
  if (![apiPort,webPort].every(port => Number.isInteger(port) && port > 0 && port < 65536)) throw new Error('Invalid development port');
  return {
    plugins: [react()],
    define: { __APP_VERSION__: JSON.stringify(version) },
    server: { host: '127.0.0.1', port: webPort, strictPort: true, proxy: { '/api': `http://127.0.0.1:${apiPort}` } },
    preview: { host: '127.0.0.1', port: webPort, strictPort: true },
  };
});
