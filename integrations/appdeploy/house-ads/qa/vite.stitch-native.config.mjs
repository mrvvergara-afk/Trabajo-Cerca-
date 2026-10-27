// Compile production components without substituting the platform's runtime SDK.
// The external SDK remains injected by AppDeploy; this does not deploy or test it.
import {defineConfig,mergeConfig} from 'vite';
import base from '../vite.config';
export default mergeConfig(base,defineConfig({build:{outDir:'qa-output/stitch-native-build',rollupOptions:{external:['@appdeploy/client']}}}));
