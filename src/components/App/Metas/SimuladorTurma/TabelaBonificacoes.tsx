// Componente: Tabela de Bonificações Sugeridas (V1 - Modelo Preferido)
import { Gift, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BonificacaoSugerida } from '@/lib/simulador-turma/tipos';
import { formatarMoeda } from '@/lib/simulador-turma/calculos';

interface TabelaBonificacoesProps {
  bonificacoes: BonificacaoSugerida[];
  mediaMeta: number;
  mediaAtual: number;
}

export function TabelaBonificacoes({
  bonificacoes,
  mediaMeta,
  mediaAtual,
}: TabelaBonificacoesProps) {
  const getCorMeta = (meta: number) => {
    if (meta < 1.5) return 'bg-rose-400';
    if (meta < 2.0) return 'bg-amber-400';
    if (meta === 2.0) return 'bg-cyan-400';
    return 'bg-emerald-400';
  };

  return (
    <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
        <Gift className="w-5 h-5 text-amber-400" />
        Tabela de Bonificações Sugeridas
        <span className="text-xs text-slate-500 ml-2">(baseado em professor com 20 alunos)</span>
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-3 px-4 text-slate-400 text-sm font-medium">Meta Atingida</th>
              <th className="text-right py-3 px-4 text-slate-400 text-sm font-medium">Economia/Prof</th>
              <th className="text-right py-3 px-4 text-slate-400 text-sm font-medium">Bônus Sugerido</th>
              <th className="text-right py-3 px-4 text-slate-400 text-sm font-medium">Lucro Escola</th>
              <th className="text-center py-3 px-4 text-slate-400 text-sm font-medium">% Repasse</th>
            </tr>
          </thead>
          <tbody>
            {bonificacoes.map((b) => {
              const isMetaSelecionada = Math.abs(b.metaAtingida - mediaMeta) < 0.05;
              const corBolinha = getCorMeta(b.metaAtingida);
              
              return (
                <tr
                  key={b.metaAtingida}
                  className={cn(
                    'border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors',
                    isMetaSelecionada && 'bg-cyan-500/5'
                  )}
                >
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-2">
                      <span className={cn('w-2 h-2 rounded-full', corBolinha)} />
                      {isMetaSelecionada ? (
                        <strong className="text-white">Média {b.metaAtingida.toFixed(1)}</strong>
                      ) : (
                        <span className="text-white">Média {b.metaAtingida.toFixed(1)}</span>
                      )}
                    </span>
                  </td>
                  <td className="text-right py-3 px-4 text-slate-400">
                    {formatarMoeda(b.economiaProfessor)}/mês
                  </td>
                  <td className={cn(
                    'text-right py-3 px-4 font-semibold',
                    isMetaSelecionada ? 'text-cyan-400 font-bold' : b.metaAtingida >= 2.0 ? 'text-emerald-400' : 'text-amber-400'
                  )}>
                    {formatarMoeda(b.bonusSugerido)}
                  </td>
                  <td className="text-right py-3 px-4 text-emerald-400">
                    {formatarMoeda(b.lucroEscola)}
                  </td>
                  <td className="text-center py-3 px-4 text-slate-400">
                    {b.percentualRepasse}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500 mt-4 flex items-center gap-2">
        <Info className="w-4 h-4" />
        Os valores de bônus são sugestões baseadas em ~45% da economia gerada. Ajuste conforme política da escola.
      </p>
    </section>
  );
}
