import { defineConfig } from 'vite';
export default defineConfig({ base: './', server: { port: 4178, strictPort: true }, build: { chunkSizeWarningLimit: 700 } });
