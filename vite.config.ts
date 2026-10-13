import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';

export default defineConfig({
  plugins: [react(), {
    name: 'local-study-only',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        let path: string;
        try { path = decodeURIComponent((request.url ?? '').split('?')[0]).replaceAll('\\', '/'); }
        catch { response.statusCode = 400; response.end(); return; }
        if (/(^|\/)(\.private|lyrics|\.git)(\/|$)/i.test(path)) {
          response.statusCode = 403;
          response.end('Private path');
          return;
        }
        next();
      });
      server.middlewares.use('/study.encrypted.json', async (_request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        try {
          const contents = await readFile(new URL('./.private/study.encrypted.json', import.meta.url));
          response.setHeader('Content-Type', 'application/json');
          response.end(contents);
        } catch {
          response.statusCode = 404;
          response.end('Local study material is unavailable.');
        }
      });
    },
  }],
  server: { host: '127.0.0.1', fs: { deny: ['**/.private/**', '**/lyrics/**', '**/.git/**', '**/.env*', '**/*.{crt,pem}'] } },
  preview: { host: '127.0.0.1' },
  base: './',
});
