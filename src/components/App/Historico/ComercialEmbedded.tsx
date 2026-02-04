/**
 * ComercialEmbedded.tsx
 * 
 * Wrapper para renderizar o ComercialDashboard dentro do AppLayout
 * sem conflito de sidebars. Esconde a sidebar interna e remove margin-left.
 * 
 * IMPORTANTE: Não modifica o ComercialDashboard.tsx original - apenas aplica CSS override.
 */

import { ComercialDashboard } from '@/components/Comercial';

export function ComercialEmbedded() {
  return (
    <div className="comercial-embedded-wrapper">
      {/* CSS para esconder a sidebar interna do ComercialDashboard e ajustar layout */}
      <style>{`
        .comercial-embedded-wrapper > div > aside {
          display: none !important;
        }
        .comercial-embedded-wrapper > div > main {
          margin-left: 0 !important;
          width: 100% !important;
        }
        .comercial-embedded-wrapper > div {
          display: block !important;
        }
      `}</style>
      <ComercialDashboard onPageChange={() => {}} />
    </div>
  );
}

export default ComercialEmbedded;
