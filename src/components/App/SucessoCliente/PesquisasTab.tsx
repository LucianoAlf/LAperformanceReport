import { useState } from 'react';
import { Star, UserX } from 'lucide-react';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';
import { PesquisaPrimeiraAulaTab } from './PesquisaPrimeiraAulaTab';
import { PesquisaEvasaoTab } from './PesquisaEvasaoTab';

type SubAba = 'pos_primeira_aula' | 'evasao';

interface Props {
  unidadeAtual: UnidadeId;
}

export function PesquisasTab({ unidadeAtual }: Props) {
  const [subAba, setSubAba] = useState<SubAba>('pos_primeira_aula');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 bg-slate-800/30 rounded-xl p-1 w-fit">
        <button
          onClick={() => setSubAba('pos_primeira_aula')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            subAba === 'pos_primeira_aula'
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <Star className="w-4 h-4" />
          Pós-1ª Aula
        </button>
        <button
          onClick={() => setSubAba('evasao')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            subAba === 'evasao'
              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <UserX className="w-4 h-4" />
          Evasão
        </button>
      </div>

      {subAba === 'pos_primeira_aula' && <PesquisaPrimeiraAulaTab unidadeAtual={unidadeAtual} />}
      {subAba === 'evasao' && <PesquisaEvasaoTab unidadeAtual={unidadeAtual} />}
    </div>
  );
}
