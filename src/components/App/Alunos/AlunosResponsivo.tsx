import { lazy, Suspense } from 'react';

import { useShellMobile } from '@/hooks/useShellMobile';

import { AlunosPage } from './AlunosPage';

/**
 * ⚠️ NAO ESTA LIGADO AO ROUTER (14/09/2026). A rota `/app/alunos` volta a
 * montar a `AlunosPage` do desktop, com a faixa ambar, porque a tela mobile
 * cobre 1 das 8 abas da pagina e nenhum dos 6 KPIs. Religar = trocar o
 * elemento da rota E acrescentar '/app/alunos' a ROTAS_PORTADAS, no mesmo
 * commit — ha teste travando os dois juntos.
 *
 * Escolhe a tela de Alunos pela MESMA funcao que escolhe o shell — nao apenas
 * pelo mesmo breakpoint. Ler so a largura faria a tela discordar do shell sob
 * VITE_MOBILE_SHELL=off e sob shell-override.
 *
 * Fica na rota, e nao no MobileLayout, porque a tela precisa do Outlet context
 * (unidade + competencia): quem nasce fora do <Outlet /> le `undefined` em
 * useOutletContext e perde os dois.
 */
const AlunosMobile = lazy(() => import('@/mobile/telas/AlunosMobile'));

export function AlunosResponsivo() {
  const shell = useShellMobile();
  if (shell !== 'mobile') return <AlunosPage />;

  return (
    <Suspense
      fallback={(
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-500" />
        </div>
      )}
    >
      <AlunosMobile />
    </Suspense>
  );
}

export default AlunosResponsivo;
