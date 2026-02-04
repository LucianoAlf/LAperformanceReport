/**
 * GestaoEmbedded.tsx
 * 
 * Wrapper para renderizar o App.tsx (Gestão 2025) dentro do AppLayout
 * sem conflito de sidebars. Esconde a sidebar interna e remove margin-left.
 * 
 * IMPORTANTE: Não modifica o App.tsx original - apenas aplica CSS override.
 */

import App from '../../../../App';

export function GestaoEmbedded() {
  return (
    <div className="gestao-embedded-wrapper">
      {/* CSS para esconder a sidebar interna do App.tsx e ajustar layout */}
      <style>{`
        .gestao-embedded-wrapper > div > nav {
          display: none !important;
        }
        .gestao-embedded-wrapper > div > main {
          margin-left: 0 !important;
          width: 100% !important;
        }
        .gestao-embedded-wrapper > div {
          display: block !important;
        }
      `}</style>
      <App />
    </div>
  );
}

export default GestaoEmbedded;
