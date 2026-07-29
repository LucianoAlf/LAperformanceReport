import { useState } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { useOutletContext } from 'react-router-dom';
import { BarChart3, TrendingUp, Users } from 'lucide-react';
import { TabGestao } from './TabGestao';
import { TabComercialNew } from './TabComercialNew';
import { TabProfessoresNew } from './TabProfessoresNew';
import { CompetenciaFilter } from '@/components/ui/CompetenciaFilter';
import { PageTabs, type PageTab } from '@/components/ui/page-tabs';
import { useAuth } from '@/contexts/AuthContext';


type TabId = 'gestao' | 'comercial' | 'professores';

interface OutletContextType {
  filtroAtivo: string | null;
  competencia: ReturnType<typeof import('@/hooks/useCompetenciaFiltro').useCompetenciaFiltro>;
}

const tabs: PageTab<TabId>[] = [
  { id: 'gestao', label: 'Gestão', shortLabel: 'Gestão', icon: BarChart3 },
  { id: 'comercial', label: 'Comercial', shortLabel: 'Comercial', icon: TrendingUp },
  { id: 'professores', label: 'Professores', shortLabel: 'Profs', icon: Users },
];

interface GestaoMensalPageProps {
  mesReferencia?: string; // formato: "2026-01"
}

export function GestaoMensalPage({ mesReferencia }: GestaoMensalPageProps) {
  useSetPageTitle({
    titulo: 'Analytics',
    subtitulo: 'Análise detalhada de gestão, comercial e professores',
    icone: BarChart3,
    iconeCor: 'text-violet-400',
    iconeWrapperCor: 'bg-violet-500/20',
  });

  const [activeTab, setActiveTab] = useState<TabId>('gestao');
  
  // Pegar filtros do contexto do Outlet (vem do AppLayout)
  const context = useOutletContext<OutletContextType>();
  const filtroAtivo = context?.filtroAtivo ?? null;
  const competencia = context?.competencia;
  
  // `filtroAtivo` null significa duas coisas: admin em consolidado, ou auth ainda não
  // resolvido. Só a primeira vira 'todos' — para perfil de unidade, pedir a rede inteira
  // é recusado com 403 pelos guards das RPCs. Mesmo padrão de AdministrativoPage.tsx.
  const { isAdmin, unidadeId } = useAuth();
  const unidadeResolvida = isAdmin ? (filtroAtivo ?? 'todos') : unidadeId;
  const unidadePronta = unidadeResolvida !== null;
  const unidadeFiltro = unidadeResolvida ?? 'todos';

  // Extrair valores do hook de competência
  const competenciaFiltro = competencia?.filtro;
  const competenciaRange = competencia?.range;
  const anosDisponiveis = competencia?.anosDisponiveis || [];
  const setTipo = competencia?.setTipo;
  const setAno = competencia?.setAno;
  const setMes = competencia?.setMes;
  const setTrimestre = competencia?.setTrimestre;
  const setSemestre = competencia?.setSemestre;
  const setDataInicio = competencia?.setDataInicio;
  const setDataFim = competencia?.setDataFim;

  const handleTabChange = (tabId: TabId) => {
    setActiveTab(tabId);
  };

  return (
    <div className="space-y-6">
      {/* Filtro de Competência */}
      {competenciaFiltro && competenciaRange && setTipo && setAno && setMes && setTrimestre && setSemestre && (
        <div data-tour="analytics-filtro-periodo" className="flex justify-end">
          <CompetenciaFilter
            filtro={competenciaFiltro}
            range={competenciaRange}
            anosDisponiveis={anosDisponiveis}
            onTipoChange={setTipo}
            onAnoChange={setAno}
            onMesChange={setMes}
            onTrimestreChange={setTrimestre}
            onSemestreChange={setSemestre}
            onDataInicioChange={setDataInicio}
            onDataFimChange={setDataFim}
          />
        </div>
      )}

      {/* Abas */}
      <PageTabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        data-tour="analytics-abas"
      />

      {/* Conteúdo da Aba Ativa */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* Sem unidade resolvida não há o que buscar: as abas pediriam a rede inteira em
            nome de um usuário de unidade e as RPCs recusariam com 403. */}
        {unidadePronta && activeTab === 'gestao' && (
          <TabGestao 
            ano={competenciaRange?.ano || new Date().getFullYear()} 
            mes={competenciaRange?.mesInicio || new Date().getMonth() + 1} 
            mesFim={competenciaRange?.mesFim}
            unidade={unidadeFiltro} 
          />
        )}
        {unidadePronta && activeTab === 'comercial' && (
          <TabComercialNew 
            ano={competenciaRange?.ano || new Date().getFullYear()} 
            mes={competenciaRange?.mesInicio || new Date().getMonth() + 1} 
            mesFim={competenciaRange?.mesFim}
            unidade={unidadeFiltro} 
          />
        )}
        {unidadePronta && activeTab === 'professores' && (
          <TabProfessoresNew 
            ano={competenciaRange?.ano || new Date().getFullYear()} 
            mes={competenciaRange?.mesInicio || new Date().getMonth() + 1} 
            mesFim={competenciaRange?.mesFim}
            unidade={unidadeFiltro} 
          />
        )}
      </div>

    </div>
  );
}

export default GestaoMensalPage;
