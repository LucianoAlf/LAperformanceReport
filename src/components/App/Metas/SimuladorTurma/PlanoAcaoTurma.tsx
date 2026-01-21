// Componente: Plano de Ação Inteligente para Simulador de Turma
// Usa Edge Function gemini-insights com contexto específico de turmas

import { useState, useEffect } from 'react';
import { Brain, Sparkles, Clock, Calendar, Target, Loader2, Save, History, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { InputsSimuladorTurma, ResultadoSimuladorTurma, ProfessorTurma, PlanoAcaoTurma as PlanoAcaoTurmaType, AcaoTurma, CENARIOS_ESCALONAMENTO } from '@/lib/simulador-turma/tipos';
import { formatarMoeda, formatarPercentual, calcularImpactoCenario } from '@/lib/simulador-turma/calculos';

interface PlanoAcaoTurmaProps {
  unidadeId: string;
  unidadeNome: string;
  resultado: ResultadoSimuladorTurma;
  inputs: InputsSimuladorTurma;
  professores: ProfessorTurma[];
}

const esforcoColors = {
  Baixo: 'bg-emerald-500/20 text-emerald-400',
  Médio: 'bg-amber-500/20 text-amber-400',
  Alto: 'bg-rose-500/20 text-rose-400',
};

const responsavelColors = {
  Coordenação: 'bg-cyan-500/20 text-cyan-400',
  Professor: 'bg-violet-500/20 text-violet-400',
  Gestor: 'bg-orange-500/20 text-orange-400',
};

function CardAcao({ acao, index }: { acao: AcaoTurma; index: number }) {
  const [expandido, setExpandido] = useState(index === 0);

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpandido(!expandido)}
        className="w-full p-4 text-left flex items-start justify-between gap-3 hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-start gap-3 flex-1">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Target className="w-4 h-4 text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-white text-sm">{acao.titulo}</h4>
            <p className="text-xs text-slate-400 mt-1">{acao.impacto}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn("text-xs px-2 py-1 rounded-full", esforcoColors[acao.esforco])}>
            {acao.esforco}
          </span>
          <span className={cn("text-xs px-2 py-1 rounded-full", responsavelColors[acao.responsavel])}>
            {acao.responsavel}
          </span>
          {expandido ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </div>
      </button>

      {expandido && (
        <div className="px-4 pb-4 pt-0">
          <div className="pl-11 space-y-3">
            <div>
              <p className="text-xs text-slate-500 mb-2">Passos:</p>
              <ul className="space-y-1">
                {acao.passos.map((passo, i) => (
                  <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                    <span className="text-cyan-400 mt-1">•</span>
                    {passo}
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <span className="text-emerald-400 text-sm">🎯 {acao.meta_sucesso}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PlanoAcaoTurma({
  unidadeId,
  unidadeNome,
  resultado,
  inputs,
  professores,
}: PlanoAcaoTurmaProps) {
  const [plano, setPlano] = useState<PlanoAcaoTurmaType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gerar plano de ação
  const gerarPlano = async () => {
    setLoading(true);
    setError(null);

    try {
      // Calcular impacto completo do cenário (inclui ganho por faixa)
      const impactoCenario = calcularImpactoCenario(
        resultado.totalAlunos,
        resultado.ticketMedio,
        resultado.mediaAtual,
        resultado.mediaMeta,
        inputs.valorBase,
        inputs.incremento,
        inputs.semanasMes
      );
      
      // Preparar dados para a Edge Function
      const profCriticos = professores.filter(p => p.status === 'critico').length;
      const profAtencao = professores.filter(p => p.status === 'atencao').length;
      const profBom = professores.filter(p => p.status === 'bom').length;
      const profExcelente = professores.filter(p => p.status === 'excelente').length;
      
      // Encontrar nome do cenário selecionado
      const cenarioSelecionado = CENARIOS_ESCALONAMENTO.find(
        c => c.valorBase === inputs.valorBase && c.incremento === inputs.incremento
      );
      
      const dadosPlano = {
        // Contexto de turmas
        contexto: 'simulador_turma',
        unidadeNome,
        
        // Situação atual
        mediaAtual: resultado.mediaAtual,
        custoAlunoAtual: resultado.custoAlunoAtual,
        folhaAtual: resultado.folhaAtual,
        percentualFolhaAtual: resultado.percentualFolhaAtual,
        margemAtual: resultado.margemAtual,
        
        // Metas
        mediaMeta: resultado.mediaMeta,
        custoAlunoMeta: resultado.custoAlunoMeta,
        folhaMeta: resultado.folhaMeta,
        percentualFolhaMeta: resultado.percentualFolhaMeta,
        margemMeta: resultado.margemMeta,
        
        // Ganhos projetados
        ganhoMargem: resultado.ganhoMargem,
        economiaMensal: resultado.economiaMensal,
        economiaAnual: resultado.economiaAnual,
        
        // Cenário de escalonamento
        valorBase: inputs.valorBase,
        incremento: inputs.incremento,
        cenarioNome: cenarioSelecionado?.nome || 'Personalizado',
        
        // Análise de ganho por faixa (NOVO - dinâmico!)
        ganhoMedioPor01: impactoCenario.ganhoMedioPor01,
        ganhoMaximoPor01: impactoCenario.ganhoMaximoPor01,
        ganhoMinimoPor01: impactoCenario.ganhoMinimoPor01,
        
        // Professores
        totalProfessores: professores.length,
        profCriticos,
        profAtencao,
        profBom,
        profExcelente,
        
        // Alertas
        alertas: resultado.alertas.map(a => ({
          tipo: a.tipo,
          titulo: a.titulo,
          mensagem: a.mensagem,
        })),
        
        // Dados gerais
        totalAlunos: resultado.totalAlunos,
        totalTurmas: Math.round(resultado.totalAlunos / resultado.mediaAtual),
        ticketMedio: resultado.ticketMedio,
        mrrTotal: resultado.mrrTotal,
        mesAtual: new Date().getMonth() + 1,
        anoAtual: new Date().getFullYear(),
      };

      const { data, error: fnError } = await supabase.functions.invoke('gemini-insights-turma', {
        body: dadosPlano,
      });

      if (fnError) throw fnError;

      setPlano(data);
    } catch (err) {
      console.error('Erro ao gerar plano:', err);
      
      // Fallback: gerar plano local se a Edge Function não existir
      setPlano(gerarPlanoLocal(resultado, professores));
    } finally {
      setLoading(false);
    }
  };

  // Gerar plano local como fallback
  const gerarPlanoLocal = (res: ResultadoSimuladorTurma, profs: ProfessorTurma[]): PlanoAcaoTurmaType => {
    const profCriticos = profs.filter(p => p.status === 'critico');
    
    return {
      diagnostico: `A unidade ${unidadeNome} opera com média de ${res.mediaAtual.toFixed(2)} alunos/turma, consumindo ${formatarPercentual(res.percentualFolhaAtual)} do faturamento em folha. Atingir média ${res.mediaMeta.toFixed(1)} reduziria a folha para ${formatarPercentual(res.percentualFolhaMeta)}, liberando ${formatarMoeda(res.economiaMensal)}/mês (~${formatarMoeda(res.economiaAnual)}/ano) para reinvestimento.`,
      acoes_curto_prazo: [
        {
          titulo: 'Mapeamento de Oportunidades de Junção',
          impacto: `Identificar ${Math.min(20, profCriticos.length * 3)}+ oportunidades de junção de turmas`,
          esforco: 'Baixo',
          passos: [
            'Listar alunos em horários consecutivos com mesmo professor',
            'Verificar compatibilidade de perfil (idade, nível)',
            'Priorizar horários com alta demanda',
            'Criar planilha de oportunidades por professor',
          ],
          meta_sucesso: '20+ oportunidades mapeadas em 7 dias',
          responsavel: 'Coordenação',
        },
      ],
      acoes_medio_prazo: [
        {
          titulo: 'Execução das Primeiras Junções com Garantia',
          impacto: 'Iniciar transição com professores piloto',
          esforco: 'Médio',
          passos: [
            'Selecionar 5 professores com maior potencial',
            'Apresentar modelo de garantia individualmente',
            'Executar primeiras junções em horários de alta demanda',
            'Acompanhar satisfação dos alunos',
          ],
          meta_sucesso: '10 turmas formadas, média subir para 1.5',
          responsavel: 'Coordenação',
        },
      ],
      acoes_longo_prazo: [
        {
          titulo: 'Escala Total e Sistema de Bonificações',
          impacto: `Atingir meta de ${res.mediaMeta.toFixed(1)} de média e ${formatarPercentual(res.margemMeta)} de margem`,
          esforco: 'Alto',
          passos: [
            'Expandir modelo para toda equipe de professores',
            'Implementar sistema de bônus por meta atingida',
            'Criar dashboard de acompanhamento por professor',
            'Revisar metas trimestralmente',
          ],
          meta_sucesso: `Média ${res.mediaMeta.toFixed(1)}, Margem ${formatarPercentual(res.margemMeta)}, Economia ${formatarMoeda(res.economiaMensal)}/mês`,
          responsavel: 'Gestor',
        },
      ],
      insights_adicionais: [
        `${profCriticos.length} professores estão em situação crítica (média < 1.3) e devem ser priorizados`,
        'O modelo de garantia elimina o risco para o professor durante a transição',
        'Cada 0.1 de aumento na média representa ~1-2% de ganho na margem bruta',
      ],
    };
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-violet-400" />
          <h3 className="font-semibold text-white">Plano de Ação Inteligente</h3>
          <Sparkles className="w-4 h-4 text-violet-400" />
        </div>
        <div className="flex gap-2">
          <button
            onClick={gerarPlano}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {plano ? 'Regenerar' : 'Gerar Plano'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm">
          {error}
        </div>
      )}

      {!plano && !loading && (
        <div className="text-center py-8 text-slate-400">
          <Brain className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Clique em "Gerar Plano" para criar um plano de ação personalizado</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-violet-400" />
          <p className="text-slate-400">Gerando plano de ação...</p>
        </div>
      )}

      {plano && !loading && (
        <div className="space-y-6">
          {/* Diagnóstico */}
          <div className="p-4 bg-violet-500/10 rounded-xl border-l-4 border-violet-500">
            <div className="flex items-center gap-2 mb-2">
              <span>💡</span>
              <span className="font-medium text-white">Diagnóstico</span>
            </div>
            <p className="text-slate-300 text-sm">{plano.diagnostico}</p>
          </div>

          {/* Curto Prazo */}
          {plano.acoes_curto_prazo.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span className="font-medium text-white">Curto Prazo (2 semanas)</span>
              </div>
              <div className="space-y-3">
                {plano.acoes_curto_prazo.map((acao, i) => (
                  <CardAcao key={i} acao={acao} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Médio Prazo */}
          {plano.acoes_medio_prazo.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span className="font-medium text-white">Médio Prazo (1 mês)</span>
              </div>
              <div className="space-y-3">
                {plano.acoes_medio_prazo.map((acao, i) => (
                  <CardAcao key={i} acao={acao} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Longo Prazo */}
          {plano.acoes_longo_prazo.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-4 h-4 text-emerald-400" />
                <span className="font-medium text-white">Longo Prazo (trimestre)</span>
              </div>
              <div className="space-y-3">
                {plano.acoes_longo_prazo.map((acao, i) => (
                  <CardAcao key={i} acao={acao} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Insights */}
          {plano.insights_adicionais.length > 0 && (
            <div className="p-4 bg-slate-900/50 rounded-xl">
              <p className="text-xs text-slate-500 mb-2">💡 Insights Adicionais:</p>
              <ul className="space-y-1">
                {plano.insights_adicionais.map((insight, i) => (
                  <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                    <span className="text-violet-400">•</span>
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
