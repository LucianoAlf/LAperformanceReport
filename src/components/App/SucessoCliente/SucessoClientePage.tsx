import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { useOutletContext } from 'react-router-dom';
import { Heart } from 'lucide-react';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { TabSucessoAluno } from './TabSucessoAluno';

export function SucessoClientePage() {
  useSetPageTitle({
    titulo: 'Sucesso do Aluno',
    subtitulo: 'Acompanhamento, presença, jornada e retenção dos alunos',
    icone: Heart,
    iconeCor: 'text-rose-400',
    iconeWrapperCor: 'bg-rose-500/20',
  });

  const context = useOutletContext<{ unidadeSelecionada: UnidadeId }>();
  const unidadeAtual = context?.unidadeSelecionada || 'todos';

  return <TabSucessoAluno unidadeAtual={unidadeAtual} />;
}
