// Componente: Simular Meta de Média (V1 - Modelo Preferido)
import { Zap, TrendingUp, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ResultadoSimuladorTurma } from '@/lib/simulador-turma/tipos';
import { formatarMoeda, formatarPercentual } from '@/lib/simulador-turma/calculos';

interface SimularMetaMediaProps {
  mediaAtual: number;
  mediaMeta: number;
  resultado: ResultadoSimuladorTurma;
  valorBase: number;
  incremento: number;
  onChangeMeta: (valor: number) => void;
}

export function SimularMetaMedia({
  mediaAtual,
  mediaMeta,
  resultado,
  valorBase,
  incremento,
  onChangeMeta,
}: SimularMetaMediaProps) {
  // Calcular posição do slider (0-100%)
  const sliderValue = ((mediaMeta - 1.0) / 2.0) * 100;
  
  // O ganho de margem é ACUMULATIVO - quanto maior a meta, maior o ganho total
  // Mas o ganho INCREMENTAL por +0.1 diminui conforme a média aumenta
  const ganhoTotal = resultado.ganhoMargem;
  const diferencaMedia = mediaMeta - mediaAtual;
  
  // Classificar o ganho total acumulado
  let classificacaoGanho: 'excelente' | 'bom' | 'moderado' | 'baixo';
  if (ganhoTotal >= 10) classificacaoGanho = 'excelente';
  else if (ganhoTotal >= 5) classificacaoGanho = 'bom';
  else if (ganhoTotal >= 2) classificacaoGanho = 'moderado';
  else classificacaoGanho = 'baixo';
  
  // Cor baseada no ganho acumulado
  const corClassificacao = classificacaoGanho === 'excelente'
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    : classificacaoGanho === 'bom'
      ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30'
      : classificacaoGanho === 'moderado'
        ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
        : 'text-slate-400 bg-slate-500/10 border-slate-500/30';

  return (
    <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
        <Zap className="w-5 h-5 text-cyan-400" />
        Simular Meta de Média
      </h2>

      {/* Slider de Meta com Barra Colorida */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm text-slate-400">Meta de Média de Alunos/Turma</label>
          <span className="text-2xl font-bold text-cyan-400">{mediaMeta.toFixed(1)}</span>
        </div>
        
        {/* Barra colorida com gradiente (rosa → amarelo → verde) */}
        <div className="relative">
          <div 
            className="w-full h-2 rounded-full"
            style={{
              background: 'linear-gradient(to right, #fb7185 0%, #fbbf24 40%, #34d399 100%)',
            }}
          />
          <input
            type="range"
            min="1.0"
            max="3.0"
            step="0.1"
            value={mediaMeta}
            onChange={(e) => onChangeMeta(Number(e.target.value))}
            className="absolute top-0 left-0 w-full h-2 appearance-none cursor-pointer bg-transparent"
            style={{
              WebkitAppearance: 'none',
            }}
          />
          <style>{`
            input[type="range"]::-webkit-slider-thumb {
              -webkit-appearance: none;
              width: 24px;
              height: 24px;
              border-radius: 50%;
              background: white;
              cursor: pointer;
              box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
              margin-top: -11px;
            }
            input[type="range"]::-moz-range-thumb {
              width: 24px;
              height: 24px;
              border-radius: 50%;
              background: white;
              cursor: pointer;
              box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
              border: none;
            }
          `}</style>
        </div>
        
        <div className="flex justify-between text-xs text-slate-500 mt-3">
          <span>1.0</span>
          <span>1.5</span>
          <span>2.0</span>
          <span>2.5</span>
          <span>3.0</span>
        </div>

        {/* Alerta informativo - Ganho ACUMULATIVO */}
        <div className={cn("mt-4 p-4 rounded-xl border", corClassificacao)}>
          <div className="flex items-start gap-3">
            {diferencaMedia > 0 ? (
              <TrendingUp className="w-5 h-5 mt-0.5 flex-shrink-0" />
            ) : (
              <Info className="w-5 h-5 mt-0.5 flex-shrink-0" />
            )}
            <div className="space-y-1">
              {diferencaMedia > 0 ? (
                <>
                  <p className="text-sm font-medium">
                    Meta {mediaMeta.toFixed(1)} = <span className="font-bold">+{ganhoTotal.toFixed(2)}%</span> de margem acumulada
                  </p>
                  <p className="text-xs opacity-80">
                    Transição: {mediaAtual.toFixed(2)} → {mediaMeta.toFixed(1)} • 
                    Base R$ {valorBase} • Incremento +R$ {incremento}
                  </p>
                  <p className="text-xs opacity-70 mt-1">
                    📈 O ganho é <strong>acumulativo</strong>: quanto maior a meta, maior o ganho total de margem
                  </p>
                </>
              ) : diferencaMedia < 0 ? (
                <>
                  <p className="text-sm font-medium">
                    Meta abaixo da média atual = <span className="font-bold text-rose-400">{ganhoTotal.toFixed(2)}%</span> de margem
                  </p>
                  <p className="text-xs opacity-80">
                    ⚠️ Mover para uma média menor que a atual reduz a margem
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    Meta igual à média atual - sem alteração na margem
                  </p>
                  <p className="text-xs opacity-80">
                    Mova o slider para simular diferentes cenários
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Comparativo Antes/Depois */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ANTES - Situação Atual */}
        <div className="bg-slate-900/50 border border-rose-500/30 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-rose-500" />
            <h3 className="font-semibold text-rose-400">Situação Atual</h3>
            <span className="text-xs text-slate-500 ml-auto">Média {mediaAtual.toFixed(2)}</span>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Custo/Aluno</span>
              <span className="font-semibold text-white">{formatarMoeda(resultado.custoAlunoAtual)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Folha Total</span>
              <span className="font-semibold text-white">{formatarMoeda(resultado.folhaAtual)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">% Folha</span>
              <span className="font-semibold text-rose-400">{formatarPercentual(resultado.percentualFolhaAtual)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-700 pt-3">
              <span className="text-slate-400 text-sm">Margem Bruta</span>
              <span className="font-bold text-lg text-white">{formatarPercentual(resultado.margemAtual)}</span>
            </div>
          </div>
        </div>

        {/* DEPOIS - Meta Projetada */}
        <div className="bg-slate-900/50 border border-emerald-500/30 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <h3 className="font-semibold text-emerald-400">Meta Projetada</h3>
            <span className="text-xs text-slate-500 ml-auto">Média {mediaMeta.toFixed(1)}</span>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Custo/Aluno</span>
              <span className="font-semibold text-white">{formatarMoeda(resultado.custoAlunoMeta)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">Folha Total</span>
              <span className="font-semibold text-white">{formatarMoeda(resultado.folhaMeta)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-sm">% Folha</span>
              <span className="font-semibold text-emerald-400">{formatarPercentual(resultado.percentualFolhaMeta)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-700 pt-3">
              <span className="text-slate-400 text-sm">Margem Bruta</span>
              <span className="font-bold text-lg text-emerald-400">{formatarPercentual(resultado.margemMeta)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cards de Ganho */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
          <p className="text-sm text-emerald-400 mb-1">Ganho de Margem</p>
          <p className="text-3xl font-bold text-emerald-400">
            +{resultado.ganhoMargem.toFixed(2)}%
          </p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
          <p className="text-sm text-emerald-400 mb-1">Economia Mensal</p>
          <p className="text-3xl font-bold text-emerald-400">
            {formatarMoeda(resultado.economiaMensal)}
          </p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
          <p className="text-sm text-emerald-400 mb-1">Economia Anual</p>
          <p className="text-3xl font-bold text-emerald-400">
            {formatarMoeda(resultado.economiaAnual)}
          </p>
        </div>
      </div>
    </section>
  );
}
