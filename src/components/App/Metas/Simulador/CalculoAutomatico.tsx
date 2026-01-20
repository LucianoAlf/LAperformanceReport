// Componente: Cálculo Automático (resultados)
// Adapta-se ao tipo de objetivo (Alunos ou MRR)

import { Calculator, TrendingDown, TrendingUp, Users, Phone, DollarSign, Lightbulb } from 'lucide-react';
import { ResultadoSimulacao, TipoObjetivo } from '@/lib/simulador/tipos';
import { formatarMoeda, formatarNumero, calcularTicketAlternativo } from '@/lib/simulador/calculos';

interface CalculoAutomaticoProps {
  resultado: ResultadoSimulacao;
  tipoObjetivo: TipoObjetivo;
}

export function CalculoAutomatico({ resultado, tipoObjetivo }: CalculoAutomaticoProps) {
  const {
    inputs,
    evasoesMensais,
    matriculasMensais,
    leadsMensais,
    mrrProjetado,
    crescimentoNecessario,
    crescimentoPercentual,
    evasoesTotais,
    matriculasTotais,
  } = resultado;

  // Calcular totais anuais
  const mesesRestantes = 12 - (new Date().getMonth());
  const leadsTotais = leadsMensais * mesesRestantes;

  // Calcular alunos objetivo (para modo MRR, é calculado a partir do MRR)
  const alunosObjetivoCalculado = tipoObjetivo === 'mrr' 
    ? Math.ceil(mrrProjetado / inputs.ticketMedio)
    : inputs.alunosObjetivo;

  // Sugestão de ticket alternativo (para modo MRR)
  const ticketAlternativo = calcularTicketAlternativo(mrrProjetado, inputs.alunosAtual + Math.round(crescimentoNecessario * 0.6));
  const alunosComTicketAlternativo = Math.ceil(mrrProjetado / ticketAlternativo);

  const isModeMRR = tipoObjetivo === 'mrr';
  
  // Cálculos de faturamento com inadimplência (modo MRR)
  const inadimplenciaPct = inputs.inadimplenciaPct || 0;
  const faturamentoPrevisto = mrrProjetado;
  const faturamentoRealizado = faturamentoPrevisto * (1 - inadimplenciaPct / 100);

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
          <Calculator className="w-4 h-4 text-violet-400" />
        </div>
        <h2 className="font-semibold text-white">CÁLCULO AUTOMÁTICO</h2>
      </div>
      
      {/* Grid 4 colunas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {isModeMRR ? (
          <>
            {/* Modo MRR: Alunos Necessários é o resultado principal */}
            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4">
              <div className="flex items-center gap-1 text-xs text-cyan-400 mb-2">
                <Users className="w-3 h-3" />
                Alunos Necessários
              </div>
              <div className="text-3xl font-bold text-cyan-400">{alunosObjetivoCalculado}</div>
              <div className="text-xs text-slate-500 mt-1">
                +{crescimentoNecessario} alunos ({crescimentoPercentual > 0 ? '+' : ''}{crescimentoPercentual.toFixed(1)}%)
              </div>
            </div>

            {/* Matrículas Necessárias */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <div className="flex items-center gap-1 text-xs text-amber-400 mb-2">
                <TrendingUp className="w-3 h-3" />
                Matrículas Necessárias
              </div>
              <div className="text-3xl font-bold text-amber-400">{matriculasMensais}/mês</div>
              <div className="text-xs text-slate-500 mt-1">{matriculasTotais} no ano</div>
            </div>

            {/* Leads Necessários */}
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
              <div className="flex items-center gap-1 text-xs text-purple-400 mb-2">
                <Phone className="w-3 h-3" />
                Leads Necessários
              </div>
              <div className="text-3xl font-bold text-purple-400">{leadsMensais}/mês</div>
              <div className="text-xs text-slate-500 mt-1">{formatarNumero(leadsTotais)} no ano</div>
            </div>

            {/* Evasões Projetadas */}
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4">
              <div className="flex items-center gap-1 text-xs text-rose-400 mb-2">
                <TrendingDown className="w-3 h-3" />
                Evasões Projetadas
              </div>
              <div className="text-3xl font-bold text-rose-400">~{evasoesMensais}/mês</div>
              <div className="text-xs text-slate-500 mt-1">{evasoesTotais} no ano</div>
            </div>
          </>
        ) : (
          <>
            {/* Modo Alunos: layout original */}
            {/* Evasões Projetadas */}
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4">
              <div className="flex items-center gap-1 text-xs text-rose-400 mb-2">
                <TrendingDown className="w-3 h-3" />
                Evasões Projetadas
              </div>
              <div className="text-3xl font-bold text-rose-400">~{evasoesMensais}/mês</div>
              <div className="text-xs text-slate-500 mt-1">{evasoesTotais} no ano</div>
            </div>

            {/* Matrículas Necessárias */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <div className="flex items-center gap-1 text-xs text-amber-400 mb-2">
                <TrendingUp className="w-3 h-3" />
                Matrículas Necessárias
              </div>
              <div className="text-3xl font-bold text-amber-400">{matriculasMensais}/mês</div>
              <div className="text-xs text-slate-500 mt-1">{matriculasTotais} no ano</div>
            </div>

            {/* Leads Necessários */}
            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4">
              <div className="flex items-center gap-1 text-xs text-cyan-400 mb-2">
                <Phone className="w-3 h-3" />
                Leads Necessários
              </div>
              <div className="text-3xl font-bold text-cyan-400">{leadsMensais}/mês</div>
              <div className="text-xs text-slate-500 mt-1">{formatarNumero(leadsTotais)} no ano</div>
            </div>

            {/* MRR Projetado */}
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
              <div className="flex items-center gap-1 text-xs text-emerald-400 mb-2">
                <DollarSign className="w-3 h-3" />
                MRR Projetado
              </div>
              <div className="text-3xl font-bold text-emerald-400">{formatarMoeda(mrrProjetado)}</div>
              <div className="text-xs text-slate-500 mt-1">
                {crescimentoPercentual > 0 ? '+' : ''}{crescimentoPercentual.toFixed(1)}%
              </div>
            </div>
          </>
        )}
      </div>

      {/* Resumo Financeiro com Inadimplência (apenas modo MRR) */}
      {isModeMRR && inadimplenciaPct > 0 && (
        <div className="bg-slate-700/30 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between text-sm">
            <div className="text-center">
              <div className="text-slate-500 text-xs mb-1">MRR Previsto</div>
              <div className="text-white font-bold">{formatarMoeda(faturamentoPrevisto)}</div>
            </div>
            <div className="text-slate-500">−</div>
            <div className="text-center">
              <div className="text-amber-400 text-xs mb-1">Inadimplência ({inadimplenciaPct}%)</div>
              <div className="text-amber-400 font-bold">−{formatarMoeda(faturamentoPrevisto - faturamentoRealizado)}</div>
            </div>
            <div className="text-slate-500">=</div>
            <div className="text-center">
              <div className="text-emerald-400 text-xs mb-1">MRR Realizado</div>
              <div className="text-emerald-400 font-bold">{formatarMoeda(faturamentoRealizado)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Sugestão de Ticket Alternativo (apenas modo MRR) */}
      {isModeMRR && ticketAlternativo > inputs.ticketMedio && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-amber-400">Alternativa: Aumentar Ticket Médio</span>
          </div>
          <p className="text-xs text-slate-400">
            Se aumentar o ticket de {formatarMoeda(inputs.ticketMedio)} para{' '}
            <strong className="text-white">{formatarMoeda(ticketAlternativo)}</strong>, 
            você precisaria de apenas{' '}
            <strong className="text-white">{alunosComTicketAlternativo} alunos</strong>{' '}
            (vs {alunosObjetivoCalculado}) para atingir o mesmo MRR.
          </p>
        </div>
      )}

      {/* Fórmula de validação */}
      <div className="bg-slate-700/30 rounded-xl p-4 flex items-center justify-center">
        <code className="text-sm text-slate-300">
          <span className="text-white font-bold">{formatarNumero(inputs.alunosAtual)}</span>
          <span className="text-slate-500"> alunos + </span>
          <span className="text-emerald-400 font-bold">{formatarNumero(matriculasTotais)}</span>
          <span className="text-slate-500"> matrículas - </span>
          <span className="text-rose-400 font-bold">{formatarNumero(evasoesTotais)}</span>
          <span className="text-slate-500"> evasões = </span>
          <span className="text-cyan-400 font-bold">{formatarNumero(alunosObjetivoCalculado)}</span>
          <span className="text-emerald-400"> ✓</span>
        </code>
      </div>
    </div>
  );
}

export default CalculoAutomatico;
