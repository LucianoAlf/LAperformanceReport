/**
 * RetencaoEmbedded.tsx
 * 
 * Wrapper para renderizar o RetencaoDashboard dentro do AppLayout
 * sem conflito de sidebars. Esconde a sidebar interna e remove margin-left.
 * 
 * IMPORTANTE: Não modifica o RetencaoDashboard.tsx original - apenas aplica CSS override.
 */

import { RetencaoDashboard } from '@/components/Retencao';

export function RetencaoEmbedded() {
  return (
    <div className="retencao-embedded-wrapper">
      {/* CSS para esconder a sidebar interna do RetencaoDashboard e ajustar layout */}
      <style>{`
        .retencao-embedded-wrapper > div > aside {
          display: none !important;
        }
        .retencao-embedded-wrapper > div > main {
          margin-left: 0 !important;
          width: 100% !important;
        }
        .retencao-embedded-wrapper > div {
          display: block !important;
        }
      `}</style>
      <RetencaoDashboard onPageChange={() => {}} />
    </div>
  );
}

export default RetencaoEmbedded;
