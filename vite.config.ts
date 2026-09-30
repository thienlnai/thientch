import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

function apiRoutesDevPlugin() {
  return {
    name: 'api-routes-dev-plugin',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();

        const urlObj = new URL(req.url, 'http://localhost:3000');
        const pathname = urlObj.pathname;

        const parseBody = () => new Promise<any>((resolve) => {
          let data = '';
          req.on('data', (chunk: any) => { data += chunk; });
          req.on('end', () => {
            try { resolve(JSON.parse(data)); } catch { resolve({}); }
          });
        });

        const executeHandler = async (handler: any, body: any = {}) => {
          const reqShim = {
            method: req.method,
            url: req.url,
            query: Object.fromEntries(urlObj.searchParams.entries()),
            body,
            headers: req.headers,
          };
          const resShim = {
            statusCode: 200,
            status(code: number) { this.statusCode = code; return this; },
            setHeader(name: string, val: string) { res.setHeader(name, val); },
            json(data: any) {
              res.statusCode = this.statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(data));
            },
            end(data = '') {
              res.statusCode = this.statusCode;
              res.end(data);
            }
          };
          await handler(reqShim, resShim);
        };

        try {
          if (pathname === '/api/check-exam-status') {
            const { default: handler } = await import('./api/check-exam-status.ts');
            const body = req.method === 'POST' ? await parseBody() : {};
            await executeHandler(handler, body);
            return;
          }
          if (pathname === '/api/exam-violation') {
            const { default: handler } = await import('./api/exam-violation.ts');
            const body = await parseBody();
            await executeHandler(handler, body);
            return;
          }
          if (pathname === '/api/unlock-exam') {
            const { default: handler } = await import('./api/unlock-exam.ts');
            const body = await parseBody();
            await executeHandler(handler, body);
            return;
          }
          if (pathname === '/api/exam') {
            const { default: handler } = await import('./api/exam.ts');
            const body = req.method === 'POST' ? await parseBody() : {};
            await executeHandler(handler, body);
            return;
          }
          if (pathname === '/api/submit-exam') {
            const { default: handler } = await import('./api/submit-exam.ts');
            const body = await parseBody();
            await executeHandler(handler, body);
            return;
          }
        } catch (err: any) {
          console.error('API Route execution error:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: err?.message || String(err) }));
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const tursoUrl = env.TURSO_DATABASE_URL || env.VITE_TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL || process.env.VITE_TURSO_DATABASE_URL || '';
  const tursoToken = env.TURSO_AUTH_TOKEN || env.VITE_TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN || '';
  const githubToken = env.GITHUB_TOKEN || env.VITE_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN || '';
  const githubOwner = env.GITHUB_OWNER || env.VITE_GITHUB_OWNER || process.env.GITHUB_OWNER || process.env.VITE_GITHUB_OWNER || '';
  const githubRepo = env.GITHUB_REPO || env.VITE_GITHUB_REPO || process.env.GITHUB_REPO || process.env.VITE_GITHUB_REPO || '';
  const githubBranch = env.GITHUB_BRANCH || env.VITE_GITHUB_BRANCH || process.env.GITHUB_BRANCH || process.env.VITE_GITHUB_BRANCH || 'main';

  return {
    plugins: [react(), tailwindcss(), apiRoutesDevPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    define: {
      'process.env.TURSO_DATABASE_URL': JSON.stringify(tursoUrl),
      'process.env.TURSO_AUTH_TOKEN': JSON.stringify(tursoToken),
      'process.env.GITHUB_TOKEN': JSON.stringify(githubToken),
      'process.env.GITHUB_OWNER': JSON.stringify(githubOwner),
      'process.env.GITHUB_REPO': JSON.stringify(githubRepo),
      'process.env.GITHUB_BRANCH': JSON.stringify(githubBranch),
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
