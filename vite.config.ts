import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import {injectConfig,runtimeConfig,isolationHeaders} from './runtime-config.mjs';
export default defineConfig(({mode})=>{
  const config=runtimeConfig({...loadEnv(mode,process.cwd(),''),...process.env});
  return {base:'/studio/',plugins:[react(),{name:'studio-runtime-html',transformIndexHtml:html=>injectConfig(html,config)}],
    optimizeDeps:{exclude:['@ffmpeg/ffmpeg','@ffmpeg/core']},
    server:{port:5174,headers:isolationHeaders},preview:{headers:isolationHeaders},
    build:{target:'es2022'},worker:{format:'es'}};
});
