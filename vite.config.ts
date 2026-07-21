import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      // NÃO injetar GEMINI_API_KEY no bundle: chaves de IA são server-side (edge functions).
      // Expor via `define` vaza a chave no JS público e levou à suspensão do projeto Google (2026-06).
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
      }
    };
});
