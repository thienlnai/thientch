import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const tursoUrl = env.TURSO_DATABASE_URL || env.VITE_TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL || process.env.VITE_TURSO_DATABASE_URL || '';
  const tursoToken = env.TURSO_AUTH_TOKEN || env.VITE_TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN || '';
  const githubToken = env.GITHUB_TOKEN || env.VITE_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_TOKEN || '';
  const githubOwner = env.GITHUB_OWNER || env.VITE_GITHUB_OWNER || process.env.GITHUB_OWNER || process.env.VITE_GITHUB_OWNER || '';
  const githubRepo = env.GITHUB_REPO || env.VITE_GITHUB_REPO || process.env.GITHUB_REPO || process.env.VITE_GITHUB_REPO || '';
  const githubBranch = env.GITHUB_BRANCH || env.VITE_GITHUB_BRANCH || process.env.GITHUB_BRANCH || process.env.VITE_GITHUB_BRANCH || 'main';

  return {
    plugins: [react(), tailwindcss()],
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
