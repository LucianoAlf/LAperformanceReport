import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { useUnidadeFiltro } from '../../../hooks/useUnidadeFiltro';

export function AppLayout() {
  const { unidadeSelecionada, setUnidadeSelecionada, filtroAtivo } = useUnidadeFiltro();

  return (
    <div className="flex min-h-screen bg-slate-950">
      <AppSidebar />
      <div className="flex-1 ml-64">
        <AppHeader 
          unidadeSelecionada={unidadeSelecionada} 
          onUnidadeChange={setUnidadeSelecionada} 
        />
        <main className="p-6">
          <Outlet context={{ filtroAtivo }} />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
