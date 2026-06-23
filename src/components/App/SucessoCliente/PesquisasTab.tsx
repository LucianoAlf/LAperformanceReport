import { useState } from 'react';
import { Star, UserX, BarChart3 } from 'lucide-react';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { PesquisaPrimeiraAulaTab } from './PesquisaPrimeiraAulaTab';
import { PesquisaEvasaoTab } from './PesquisaEvasaoTab';
import { RespostasPesquisaTab } from './RespostasPesquisaTab';

type SubAba = 'pos_primeira_aula' | 'evasao' | 'respostas';

interface Props {
  unidadeAtual: UnidadeId;
  onAbrirConversa?: (alunoId: number) => void;
}

export function PesquisasTab({ unidadeAtual, onAbrirConversa }: Props) {
  const [subAba, setSubAba] = useState<SubAba>('pos_primeira_aula');

  const botaoClasse = (ativo: boolean) =>
    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
      ativo
        ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
    }`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 bg-slate-800/30 rounded-xl p-1 w-fit">
        <button onClick={() => setSubAba('pos_primeira_aula')} className={botaoClasse(subAba === 'pos_primeira_aula')}>
          <Star className="w-4 h-4" />
          Pós-1ª Aula
        </button>
        <button onClick={() => setSubAba('evasao')} className={botaoClasse(subAba === 'evasao')}>
          <UserX className="w-4 h-4" />
          Evasão
        </button>
        <button onClick={() => setSubAba('respostas')} className={botaoClasse(subAba === 'respostas')}>
          <BarChart3 className="w-4 h-4" />
          Respostas
        </button>
      </div>

      {subAba === 'pos_primeira_aula' && <PesquisaPrimeiraAulaTab unidadeAtual={unidadeAtual} />}
      {subAba === 'evasao' && <PesquisaEvasaoTab unidadeAtual={unidadeAtual} />}
      {subAba === 'respostas' && (
        <RespostasPesquisaTab unidadeAtual={unidadeAtual} onAbrirConversa={onAbrirConversa} />
      )}
    </div>
  );
}
