// Componente: Cenários de Escalonamento de Pagamento
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CenarioEscalonamento } from '@/lib/simulador-turma/tipos';
import { calcularCustoPorTurma, calcularPercentualFolha, calcularMargem } from '@/lib/simulador-turma/calculos';

interface CenariosEscalonamentoProps {
  cenarios: CenarioEscalonamento[];
  cenarioAtivo: string;
  valorBase: number;
  incremento: number;
  mediaMeta: number;
  onSelectCenario: (id: CenarioEscalonamento['id']) => void;
  onChangeValorBase: (valor: number) => void;
  onChangeIncremento: (valor: number) => void;
}

const corMap: Record<string, { bg: string; text: string; border: string }> = {
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/50' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/50' },
};

export function CenariosEscalonamento({
  cenarios,
  cenarioAtivo,
  valorBase,
  incremento,
  mediaMeta,
  onSelectCenario,
  onChangeValorBase,
  onChangeIncremento,
}: CenariosEscalonamentoProps) {
  // Calcular margem para cada cenário na meta selecionada
  const calcularMargemCenario = (c: CenarioEscalonamento) => {
    const custoTurma = calcularCustoPorTurma(mediaMeta, c.valorBase, c.incremento);
    const custoAluno = custoTurma / mediaMeta;
    // Assumindo ticket médio de R$ 419 para cálculo de exemplo
    const ticketMedio = 419;
    const percentualFolha = (custoAluno / ticketMedio) * 100;
    return calcularMargem(percentualFolha);
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-5 h-5 text-cyan-400" />
        <h3 className="font-semibold text-white">Cenários de Escalonamento</h3>
      </div>
      <p className="text-slate-400 text-sm mb-6">
        Escolha como pagar os professores por aluno na turma
      </p>

      {/* Cards de cenários */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {cenarios.map((cenario) => {
          const isSelected = cenarioAtivo === cenario.id;
          const cores = corMap[cenario.cor] || corMap.emerald;
          const margem = calcularMargemCenario(cenario);
          const percentualFolha = 100 - margem;

          return (
            <button
              key={cenario.id}
              onClick={() => onSelectCenario(cenario.id)}
              className={cn(
                'p-5 rounded-xl text-left transition-all',
                'border-2 hover:scale-[1.02]',
                isSelected
                  ? `${cores.bg} ${cores.border} border-2`
                  : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
              )}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className={cores.text}>{cenario.icone}</span>
                <h4 className={cn('font-semibold', cores.text)}>{cenario.nome}</h4>
              </div>
              <p className="text-slate-400 text-sm mb-4">{cenario.descricao}</p>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Base (1 aluno)</span>
                  <span className="font-medium text-white">R$ {cenario.valorBase}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Incremento</span>
                  <span className={cn('font-medium', cores.text)}>+R$ {cenario.incremento}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-700">
                <div className="flex justify-between mb-2 text-sm">
                  <span className="text-slate-500">Margem em {mediaMeta.toFixed(1)}:</span>
                  <span className={cn('font-bold', cores.text)}>{margem.toFixed(2)}%</span>
                </div>
                <div className={cn('text-center py-2 rounded-lg', cores.bg)}>
                  <span className={cn('text-sm', cores.text)}>~{percentualFolha.toFixed(0)}% Folha</span>
                </div>
              </div>

              {isSelected && (
                <div className="mt-4 text-center">
                  <span className={cn('text-sm', cores.text)}>✓ Selecionado</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Personalizado */}
      <div className="flex items-center gap-4 p-4 bg-slate-900/50 rounded-xl">
        <span className="text-slate-400">⚙️ Personalizado:</span>
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-sm">Base R$</span>
          <input
            type="number"
            value={valorBase}
            onChange={(e) => {
              onSelectCenario('personalizado');
              onChangeValorBase(Number(e.target.value));
            }}
            className="w-20 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-center focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-sm">Incremento +R$</span>
          <input
            type="number"
            value={incremento}
            onChange={(e) => {
              onSelectCenario('personalizado');
              onChangeIncremento(Number(e.target.value));
            }}
            className="w-20 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-center focus:border-cyan-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
