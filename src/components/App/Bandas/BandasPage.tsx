import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOutletContext } from 'react-router-dom';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { PageTabs, type PageTab } from '@/components/ui/page-tabs';
import { PageFilterBar } from '@/components/ui/page-filter-bar';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { Guitar, Calendar, BarChart3, UserSearch, Link2 } from 'lucide-react';
import { useConciliacaoRoster, useTurmasAConfirmar } from '@/hooks/useBandas';
import { ListaBandasTab } from './ListaBandasTab';
import { EventosTab } from './EventosTab';
import { DashboardBandasTab } from './DashboardBandasTab';
import { GarimparTab } from './GarimparTab';
import { ConciliacaoTab } from './ConciliacaoTab';

type TabAtiva = 'lista' | 'eventos' | 'dashboard' | 'garimpar' | 'conciliacao';

export function BandasPage() {
  useSetPageTitle({
    titulo: 'Bandas',
    subtitulo: 'Bandas formadas por unidade, integrantes, repertório e eventos',
    icone: Guitar,
    iconeCor: 'text-white',
    iconeWrapperCor: 'bg-gradient-to-br from-purple-500 to-pink-500',
  });

  const context = useOutletContext<{ filtroAtivo: boolean; unidadeSelecionada: UnidadeId }>();
  const unidadeAtual = context?.unidadeSelecionada || 'todos';

  const [searchParams, setSearchParams] = useSearchParams();
  const tabUrl = searchParams.get('tab');
  const [tabAtiva, setTabAtiva] = useState<TabAtiva>(() =>
    ['lista', 'eventos', 'dashboard', 'garimpar', 'conciliacao'].includes(tabUrl || '')
      ? (tabUrl as TabAtiva)
      : 'dashboard',
  );

  useEffect(() => {
    if (tabUrl && ['lista', 'eventos', 'dashboard', 'garimpar', 'conciliacao'].includes(tabUrl)) {
      setTabAtiva(tabUrl as TabAtiva);
    }
  }, [tabUrl]);

  const alterarTab = (tab: TabAtiva) => {
    setTabAtiva(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'dashboard') next.delete('tab'); else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  // A aba Conciliação tem duas seções: a fila de batismo (acionável) e os integrantes
  // fora do roster do Emusys (informativo). O badge conta só o que exige ação.
  const { turmas, recarregar: recarregarTurmas } = useTurmasAConfirmar(unidadeAtual);
  const { itens: conciliacao, recarregar: recarregarConciliacao } = useConciliacaoRoster(unidadeAtual);

  // Confirmar/descartar muda a lista de bandas oficiais e pode mexer no roster: recarrega os dois.
  const aoResolverTurma = () => {
    recarregarTurmas();
    recarregarConciliacao();
  };

  const tabs: PageTab<TabAtiva>[] = [
    { id: 'dashboard', label: 'Dashboard', shortLabel: 'KPIs', icon: BarChart3 },
    { id: 'lista', label: 'Bandas', shortLabel: 'Bandas', icon: Guitar },
    { id: 'eventos', label: 'Eventos', shortLabel: 'Eventos', icon: Calendar },
    { id: 'garimpar', label: 'Garimpar', shortLabel: 'Garimpar', icon: UserSearch },
    {
      id: 'conciliacao',
      label: 'Conciliação',
      shortLabel: 'Concil.',
      icon: Link2,
      count: turmas.length > 0 ? turmas.length : undefined,
    },
  ];

  return (
    <div className="space-y-4">
      <PageFilterBar />
      <PageTabs tabs={tabs} activeTab={tabAtiva} onTabChange={alterarTab} />

      {tabAtiva === 'dashboard' && <DashboardBandasTab unidadeAtual={unidadeAtual} />}
      {tabAtiva === 'lista' && <ListaBandasTab unidadeAtual={unidadeAtual} />}
      {tabAtiva === 'eventos' && <EventosTab unidadeAtual={unidadeAtual} />}
      {tabAtiva === 'garimpar' && <GarimparTab unidadeAtual={unidadeAtual} />}
      {tabAtiva === 'conciliacao' && (
        <ConciliacaoTab
          unidadeAtual={unidadeAtual}
          turmas={turmas}
          itens={conciliacao}
          onTurmaResolvida={aoResolverTurma}
        />
      )}
    </div>
  );
}

export default BandasPage;
