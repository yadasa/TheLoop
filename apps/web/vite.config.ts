import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({envDir:process.env.THELOOP_ISOLATED_WEB_BUILD==='1'?false:undefined,plugins:[react()],resolve:{alias:{'@theloop/core':fileURLToPath(new URL('../../packages/core/src/index.ts',import.meta.url)),'@theloop/client':fileURLToPath(new URL('../../packages/client/src/index.tsx',import.meta.url))},dedupe:['react','react-dom']},server:{host:'127.0.0.1',port:5178},build:{target:'es2022',outDir:'../../dist',emptyOutDir:true}});
