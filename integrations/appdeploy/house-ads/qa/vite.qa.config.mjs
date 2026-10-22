import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
export default defineConfig({plugins:[react()],resolve:{alias:{'@appdeploy/client':resolve('qa/sdk-browser-stub.ts')}},server:{host:'127.0.0.1',port:4174,strictPort:true},build:{outDir:'qa-dist'}});
