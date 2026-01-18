import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { useUnidadeFiltro } from '../../../hooks/useUnidadeFiltro';
import { useCompetenciaFiltro } from '../../../hooks/useCompetenciaFiltro';

export function AppLayout() {
  const { unidadeSelecionada, setUnidadeSelecionada, filtroAtivo } = useUnidadeFiltro();
  const competencia = useCompetenciaFiltro();

  return (
    <div className="flex min-h-screen bg-slate-950">
      <AppSidebar />
      <div className="flex-1 ml-64">
        <AppHeader 
          unidadeSelecionada={unidadeSelecionada} 
          onUnidadeChange={setUnidadeSelecionada}
          periodoLabel={competencia.range.label}
        />
        <main className="p-6">
          <Outlet context={{ filtroAtivo, competencia }} />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
