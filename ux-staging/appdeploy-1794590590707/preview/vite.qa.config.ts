// Isolated build harness. NEVER deploy this config. AppDeploy SDK is supplied
// by AppDeploy in production; this local alias tests React/CSS/import graphs only.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  plugins:[react()],
  base:'./',
  resolve:{alias:{'@appdeploy/client':resolve(__dirname,'qa/appdeploy-client-stub.ts')}},
  build:{outDir:'dist-qa',sourcemap:false,reportCompressedSize:true},
});
