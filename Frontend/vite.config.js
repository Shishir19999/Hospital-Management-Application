import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const REPO_BASE = '/Hospital-Management-Application/';

// Modes: default (full stack, talks to the API), `demo` (browser-only demo served at /),
// `pages` (browser-only demo built for GitHub Pages under the repository path).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const demo = mode === 'pages' || mode === 'demo' || env.VITE_DEMO === 'true';
  return {
    base: mode === 'pages' ? REPO_BASE : env.VITE_BASE || '/',
    plugins: [react()],
    server: { fs: { allow: ['..'] } },
    define: demo ? { 'import.meta.env.VITE_DEMO': JSON.stringify('true') } : {},
    test: { environment: 'node', include: ['src/**/*.test.js'] },
  };
});
