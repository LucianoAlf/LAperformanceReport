import { useState } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { useOutletContext } from 'react-router-dom';
import { Heart, Inbox, LineChart } from 'lucide-react';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { PageTabs, type PageTab } from '@/components/ui/page-tabs';
import { CaixaEntradaTab } from '@/components/App/Administrativo/CaixaEntrada';
import { TabSucessoAluno } from './TabSucessoAluno';

type AbaModulo = 'caixa' | 'acompanhamento';

const sucessoTabs: PageTab<AbaModulo>[] = [
  { id: 'caixa', label: 'Caixa de Entrada', shortLabel: 'Caixa', icon: Inbox },
  { id: 'acompanhamento', label: 'Acompanhamento', shortLabel: 'Acomp.', icon: LineChart },
];

export function SucessoClientePage() {
  useSetPageTitle({
    titulo: 'Sucesso do Aluno',
    subtitulo: 'Atendimento, acompanhamento, presença e retenção dos alunos',
    icone: Heart,
    iconeCor: 'text-rose-400',
    iconeWrapperCor: 'bg-rose-500/20',
  });

  const context = useOutletContext<{ unidadeSelecionada: UnidadeId }>();
  const unidadeAtual = context?.unidadeSelecionada || 'todos';

  const [aba, setAba] = useState<AbaModulo>('caixa');

  return (
    <div className="space-y-4">
      <PageTabs tabs={sucessoTabs} activeTab={aba} onTabChange={setAba} />

      {aba === 'caixa' ? (
        // Caixa de Entrada travada no departamento Sucesso do Aluno:
        // só recebe as conversas do número dedicado a Sucesso.
        <CaixaEntradaTab unidadeId={unidadeAtual} departamento="sucesso_aluno" multiUnidade />
      ) : (
        <TabSucessoAluno unidadeAtual={unidadeAtual} />
      )}
    </div>
  );
}
