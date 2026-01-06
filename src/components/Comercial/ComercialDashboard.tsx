import { useState } from 'react';
import { SecaoComercial, UnidadeComercial } from '../../types/comercial';
import SidebarComercial from './SidebarComercial';
import ComercialInicio from './ComercialInicio';
import ComercialVisaoGeral from './ComercialVisaoGeral';
import ComercialFunil from './ComercialFunil';
import ComercialRanking from './ComercialRanking';
import ComercialSazonalidade from './ComercialSazonalidade';
import ComercialFinanceiro from './ComercialFinanceiro';
import ComercialAlertas from './ComercialAlertas';
import ComercialMetas from './ComercialMetas';
import ComercialProfessores from './ComercialProfessores';
import ComercialCursos from './ComercialCursos';
import ComercialOrigem from './ComercialOrigem';

interface ComercialDashboardProps {
  onPageChange: (page: 'gestao' | 'comercial') => void;
}

export function ComercialDashboard({ onPageChange }: ComercialDashboardProps) {
  const [activeSection, setActiveSection] = useState<SecaoComercial>('inicio');
  const [ano, setAno] = useState(2025);
  const [unidade, setUnidade] = useState<UnidadeComercial>('Consolidado');

  const renderSection = () => {
    switch (activeSection) {
      case 'inicio':
        return <ComercialInicio onStart={() => setActiveSection('visao-geral')} />;
      
      case 'visao-geral':
        return (
          <ComercialVisaoGeral 
            ano={ano} 
            unidade={unidade} 
            onAnoChange={setAno} 
            onUnidadeChange={setUnidade} 
          />
        );
      
      case 'funil':
        return <ComercialFunil ano={ano} unidade={unidade} onAnoChange={setAno} onUnidadeChange={setUnidade} />;
      
      case 'professores':
        return <ComercialProfessores />;
      
      case 'cursos':
        return <ComercialCursos />;
      
      case 'origem':
        return <ComercialOrigem />;
      
      case 'ranking':
        return <ComercialRanking />;
      
      case 'sazonalidade':
        return <ComercialSazonalidade />;
      
      case 'financeiro':
        return <ComercialFinanceiro ano={ano} unidade={unidade} onAnoChange={setAno} onUnidadeChange={setUnidade} />;
      
      case 'alertas':
        return <ComercialAlertas />;
      
      case 'metas':
        return <ComercialMetas />;
      
      default:
        return <PlaceholderSection title="Em Construção" description="Esta seção será implementada em breve." />;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950">
      <SidebarComercial 
        activeSection={activeSection} 
        onSectionChange={setActiveSection}
        onPageChange={onPageChange}
      />
      
      <main className="flex-1 overflow-y-auto">
        {renderSection()}
      </main>
    </div>
  );
}

// Componente placeholder para seções não implementadas
function PlaceholderSection({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-center justify-center h-full min-h-screen">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl">🚧</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
        <p className="text-gray-400 mb-6">{description}</p>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <span className="text-emerald-400 text-sm">
            Esta seção será implementada na próxima etapa
          </span>
        </div>
      </div>
    </div>
  );
}

export default ComercialDashboard;
