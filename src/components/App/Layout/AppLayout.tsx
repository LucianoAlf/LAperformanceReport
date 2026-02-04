import { Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { useUnidadeFiltro } from '../../../hooks/useUnidadeFiltro';
import { useCompetenciaFiltro } from '../../../hooks/useCompetenciaFiltro';
import { OnboardingChecklist } from '@/components/Onboarding/OnboardingChecklist';

export function AppLayout() {
  const { unidadeSelecionada, setUnidadeSelecionada, filtroAtivo } = useUnidadeFiltro();
  const competencia = useCompetenciaFiltro();
  
  // Monitorar estado da sidebar (colapsada ou expandida)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === 'true';
  });

  // Escutar mudanças no localStorage (quando sidebar colapsa/expande)
  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('sidebar-collapsed');
      setIsSidebarCollapsed(saved === 'true');
    };

    // Verificar a cada 100ms se houve mudança (fallback para navegadores que não suportam storage event)
    const interval = setInterval(handleStorageChange, 100);
    
    // Também escutar evento de storage
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-950">
      <AppSidebar data-tour="sidebar" />
      <div 
        className="flex-1 transition-all duration-300"
        style={{ 
          marginLeft: isSidebarCollapsed ? '96px' : '256px' // 24 (w-24) ou 64 (w-64) em pixels
        }}
      >
        <AppHeader 
          unidadeSelecionada={unidadeSelecionada} 
          onUnidadeChange={setUnidadeSelecionada}
          periodoLabel={competencia.range.label}
        />
        <main className="p-6">
          <Outlet context={{ filtroAtivo, unidadeSelecionada, competencia }} />
        </main>
      </div>
      
      {/* Modal de Onboarding - aparece no primeiro acesso */}
      <OnboardingChecklist />
    </div>
  );
}

export default AppLayout;
