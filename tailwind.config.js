// Tailwind compilado no build (06/10/2026). Antes vinha do Play CDN (cdn.tailwindcss.com),
// que gera o CSS DENTRO do navegador a cada mudança na tela: medido, dobra o custo de
// estilo em tabela grande e bloqueia o início da página por 124 KB de script.
// Versão travada em 3.4.17 = a mesma que o CDN servia, para o visual não mudar.
// O tema abaixo é cópia literal do `tailwind.config` que ficava inline no index.html.

// Classes montadas em tempo de execução (`text-${cor}-400`) não são vistas pelo scanner do
// build; o CDN as gerava na hora. Lista medida em 06/10: Metas, Simulador, Campanhas,
// Projetos. Ao criar classe dinâmica nova, prefira escrever a classe inteira no código.
const CORES = 'amber|blue|cyan|emerald|green|indigo|orange|pink|purple|red|rose|sky|slate|teal|violet|yellow|lime|fuchsia|gray';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './constants.tsx',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  // Lista explícita: padrões (regex) do safelist não geram modificador de opacidade (/20).
  safelist: CORES.split('|').flatMap((c) => [
    `text-${c}-400`,
    `bg-${c}-500`,
    `bg-${c}-500/20`,
    `border-${c}-500/30`,
    `from-${c}-500/10`,
  ]),
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        grotesk: ['Space Grotesk', 'sans-serif'],
      },
      colors: {
        accent: {
          cyan: '#00d4ff',
          pink: '#ff3366',
          green: '#00cc66',
          yellow: '#ffaa00',
          purple: '#8b5cf6',
        },
      },
    },
  },
  plugins: [],
};
