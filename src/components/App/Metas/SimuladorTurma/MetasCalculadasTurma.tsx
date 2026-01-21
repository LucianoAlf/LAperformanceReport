// Componente: Metas Calculadas para Simulador de Turma
import { CheckCircle, Target, Save, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ResultadoSimuladorTurma } from '@/lib/simulador-turma/tipos';
import { formatarMoeda, formatarPercentual } from '@/lib/simulador-turma/calculos';

interface MetasCalculadasTurmaProps {
  resultado: ResultadoSimuladorTurma;
  onAplicarMetas: () => void;
  onSalvarCenario: () => void;
  salvando?: boolean;
}

export function MetasCalculadasTurma({
  resultado,
  onAplicarMetas,
  onSalvarCenario,
}: MetasCalculadasTurmaProps) {
  const cards = [
    {
      label: 'Média Atual',
      valor: resultado.mediaAtual.toFixed(2),
      cor: 'text-white',
    },
    {
      label: 'Meta Média',
      valor: resultado.mediaMeta.toFixed(1),
      cor: 'text-emerald-400',
    },
    {
      label: '% Folha Atual',
      valor: formatarPercentual(resultado.percentualFolhaAtual),
      cor: 'text-rose-400',
    },
    {
      label: '% Folha Meta',
      valor: formatarPercentual(resultado.percentualFolhaMeta),
      cor: 'text-emerald-400',
    },
    {
      label: 'Margem Atual',
      valor: formatarPercentual(resultado.margemAtual),
      cor: 'text-white',
    },
    {
      label: 'Margem Meta',
      valor: formatarPercentual(resultado.margemMeta),
      cor: 'text-emerald-400',
    },
  ];

  // Formatar economia anual de forma compacta
  const economiaAnualFormatada = resultado.economiaAnual >= 1000
    ? `R$ ${(resultado.economiaAnual / 1000).toFixed(0)}k`
    : formatarMoeda(resultado.economiaAnual);

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <CheckCircle className="w-5 h-5 text-emerald-400" />
        <h3 className="font-semibold text-white">METAS CALCULADAS</h3>
      </div>

      <div className="grid grid-cols-7 gap-3 mb-6">
        {cards.map((card, index) => (
          <div key={index} className="text-center p-4 bg-slate-900/50 rounded-xl">
            <p className="text-slate-500 text-xs mb-2">{card.label}</p>
            <p className={cn('text-xl font-bold', card.cor)}>{card.valor}</p>
          </div>
        ))}
        
        {/* Card de Economia destacado */}
        <div className="text-center p-4 bg-emerald-500/20 rounded-xl border border-emerald-500/30">
          <p className="text-slate-400 text-xs mb-2">Economia/Ano</p>
          <p className="text-xl font-bold text-emerald-400">{economiaAnualFormatada}</p>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onAplicarMetas}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white font-medium rounded-xl transition-all"
        >
          <Target className="w-4 h-4" />
          Aplicar Metas
        </button>
        <button
          onClick={onSalvarCenario}
          className="flex items-center gap-2 px-6 py-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 text-white font-medium rounded-xl transition-all"
        >
          <Save className="w-4 h-4" />
          Salvar Cenário
        </button>
      </div>
    </div>
  );
}
