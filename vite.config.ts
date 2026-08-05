import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function appSpaFallbackPlugin(): Plugin {
  const rewriteAppRoute = (
    req: { url?: string },
    _res: unknown,
    next: () => void,
  ) => {
    if (req.url && /^\/app(?:\/|\?|#|$)/.test(req.url)) {
      const queryIndex = req.url.search(/[?#]/);
      const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
      req.url = `/index.html${query}`;
    }
    next();
  };

  return {
    name: 'app-spa-fallback-windows',
    configureServer(server) {
      server.middlewares.use(rewriteAppRoute);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewriteAppRoute);
    },
  };
}

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [appSpaFallbackPlugin(), react()],
      // NÃO injetar GEMINI_API_KEY no bundle: chaves de IA são server-side (edge functions).
      // Expor via `define` vaza a chave no JS público e levou à suspensão do projeto Google (2026-06).
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
      }
    };
});
