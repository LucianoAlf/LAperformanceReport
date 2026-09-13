import { lazy, Suspense } from 'react';

import { useShellMobile } from '@/hooks/useShellMobile';

import DashboardPage from './DashboardPage';

/**
 * Escolhe a tela do Dashboard pela MESMA funcao que escolhe o shell — nao
 * apenas pelo mesmo breakpoint. Ler so a largura fazia a tela discordar do
 * shell sob VITE_MOBILE_SHELL=off e sob shell-override.
 *
 * Fica na rota, e nao no MobileLayout, porque a tela precisa do Outlet
 * context (unidade + competencia): quem nasce fora do <Outlet /> le
 * `undefined` em useOutletContext e perde os dois, e as RPCs recusam com
 * 403 "unidade fora do escopo".
 */
const DashboardMobile = lazy(() => import('@/mobile/telas/DashboardMobile'));

export function DashboardResponsivo() {
  const shell = useShellMobile();
  if (shell !== 'mobile') return <DashboardPage />;

  return (
    <Suspense
      fallback={(
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-cyan-500" />
        </div>
      )}
    >
      <DashboardMobile />
    </Suspense>
  );
}

export default DashboardResponsivo;
