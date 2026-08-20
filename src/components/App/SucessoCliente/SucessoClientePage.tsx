import { useEffect, useState } from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { useOutletContext, useSearchParams } from 'react-router-dom';
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
  const [searchParams] = useSearchParams();
  const abrirPesquisaEvasao = searchParams.get('destino') === 'pesquisas-evasao';

  useSetPageTitle({
    titulo: 'Sucesso do Aluno',
    subtitulo: 'Atendimento, acompanhamento, presença e retenção dos alunos',
    icone: Heart,
    iconeCor: 'text-rose-400',
    iconeWrapperCor: 'bg-rose-500/20',
  });

  const context = useOutletContext<{ unidadeSelecionada: UnidadeId }>();
  const unidadeAtual = context?.unidadeSelecionada || 'todos';

  const [aba, setAba] = useState<AbaModulo>(abrirPesquisaEvasao ? 'acompanhamento' : 'caixa');
  const [alunoParaCaixa, setAlunoParaCaixa] = useState<number | null>(null);
  // O telefone vem junto porque conversa aberta por automação costuma não ter `aluno_id`.
  const [telefoneParaCaixa, setTelefoneParaCaixa] = useState<string | null>(null);

  const abrirConversaAluno = (alunoId: number | null, telefone?: string | null) => {
    setAlunoParaCaixa(alunoId);
    setTelefoneParaCaixa(telefone ?? null);
    setAba('caixa');
  };

  useEffect(() => {
    if (abrirPesquisaEvasao) setAba('acompanhamento');
  }, [abrirPesquisaEvasao]);

  return (
    <div className="space-y-4">
      <PageTabs tabs={sucessoTabs} activeTab={aba} onTabChange={setAba} />

      {aba === 'caixa' ? (
        // Caixa de Entrada travada no departamento Sucesso do Aluno:
        // só recebe as conversas do número dedicado a Sucesso.
        <CaixaEntradaTab
          unidadeId={unidadeAtual}
          departamento="sucesso_aluno"
          multiUnidade
          alunoIdInicial={alunoParaCaixa}
          telefoneInicial={telefoneParaCaixa}
        />
      ) : (
        <TabSucessoAluno
          unidadeAtual={unidadeAtual}
          onAbrirConversa={abrirConversaAluno}
          abrirPesquisaEvasao={abrirPesquisaEvasao}
        />
      )}
    </div>
  );
}
