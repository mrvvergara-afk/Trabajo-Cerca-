import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
import {cpSync,copyFileSync} from 'node:fs';
export default defineConfig({
  plugins:[react(),{name:'stitch-comparison-assets',closeBundle(){
    cpSync('qa/stitch-reference','qa-stitch-dist/references',{recursive:true});
    copyFileSync('qa/stitch-compare.html','qa-stitch-dist/index.html');
  }}],
  resolve:{alias:{'@appdeploy/client':resolve('qa/stitch-sdk.ts')}},
  server:{host:'127.0.0.1',port:4174,strictPort:true},
  preview:{host:'127.0.0.1',port:4174,strictPort:true},
  build:{outDir:'qa-stitch-dist',rollupOptions:{input:resolve('qa/stitch-preview.html')}}
});
