import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ command }) => {
  if (command === 'build') {
    for (const script of ['generate-pwa-icons.mjs', 'test-pwa-brand.mjs']) {
      execFileSync(process.execPath, [fileURLToPath(new URL('./scripts/' + script, import.meta.url))], { stdio: 'inherit' });
    }
  }
  return {
  plugins: [react()],
  base: './',
  build: {
    outDir: process.env.APPDEPLOY_VITE_OUT_DIR || 'dist',
    sourcemap:
      process.env.APPDEPLOY_VITE_SOURCEMAP === 'hidden' ? 'hidden' : false,
    rollupOptions: {
      maxParallelFileOps: 128,
    },
  },
  };
});
