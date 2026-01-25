'use client';

import React, { useState } from 'react';
import { 
  Brain, Sparkles, Loader2, Phone, MessageSquare, Users, Settings,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Target,
  Lightbulb, Calendar, ChevronDown, ChevronUp, Trophy, Zap
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Mapeamento de UUIDs para nomes de unidade
const UUID_NOME_MAP: Record<string, string> = {
  '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra',
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
  '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
};

// Mapeamento de códigos legados para UUIDs (caso ainda sejam usados)
const CODIGO_UUID_MAP: Record<string, string> = {
  'bar': '368d47f5-2d88-4475-bc14-ba084a9a348e',
  'cg': '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  'rec': '95553e96-971b-4590-a6eb-0201d013c14d',
};

function getUnidadeUUID(unidadeId: string | null): string | null {
  if (!unidadeId || unidadeId === 'todos') return null;
  // Se já é um UUID, retorna ele mesmo
  if (unidadeId.includes('-')) return unidadeId;
  // Se é um código legado, converte para UUID
  return CODIGO_UUID_MAP[unidadeId] || unidadeId;
}

function getUnidadeNome(unidadeId: string | null): string {
  if (!unidadeId || unidadeId === 'todos') return 'Consolidado';
  // Se é um UUID, busca o nome
  if (UUID_NOME_MAP[unidadeId]) return UUID_NOME_MAP[unidadeId];
  // Se é um código legado
  const uuid = CODIGO_UUID_MAP[unidadeId];
  if (uuid && UUID_NOME_MAP[uuid]) return UUID_NOME_MAP[uuid];
  return unidadeId;
}

interface Conquista {
  tipo: 'meta_batida' | 'melhoria' | 'destaque';
  titulo: string;
  descricao: string;
  emoji: string;
}

interface AlertaUrgente {
  severidade: 'critico' | 'atencao' | 'info';
  titulo: string;
  descricao: string;
  acao_imediata: string;
}

interface PlanoAcao {
  prioridade: number;
  tipo: 'ligacao' | 'mensagem' | 'reuniao' | 'processo';
  titulo: string;
  descricao: string;
  impacto_esperado: string;
}

interface InsightFidelizacao {
  insight: string;
  acao_sugerida: string;
}

interface InsightsRetencao {
  saudacao_motivacional: string;
  saude_retencao: 'critica' | 'atencao' | 'saudavel' | 'excelente';
  conquistas: Conquista[];
  alertas_urgentes: AlertaUrgente[];
  analise_kpis: {
    resumo: string;
    comparativo_mes_anterior: {
      melhorias: string[];
      pioras: string[];
    };
    comparativo_ano_anterior: {
      observacao: string;
    };
  };
  renovacoes_proximas: {
    total_7_dias: number;
    total_15_dias: number;
    total_30_dias: number;
    acao_sugerida: string;
  };
  plano_acao_semanal: PlanoAcao[];
  insights_fidelizacao: InsightFidelizacao[];
  dica_do_dia: string;
  mensagem_final: string;
}

interface PlanoAcaoRetencaoProps {
  unidadeId: string;
  ano: number;
  mes: number;
}

export function PlanoAcaoRetencao({ unidadeId, ano, mes }: PlanoAcaoRetencaoProps) {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<InsightsRetencao | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandido, setExpandido] = useState(true);

  async function gerarAnalise() {
    setLoading(true);
    setError(null);

    try {
      // Converter código para UUID
      const unidadeUUID = getUnidadeUUID(unidadeId);
      const nomeUnidade = getUnidadeNome(unidadeId);
      const isConsolidado = unidadeId === 'todos';

      // DEBUG: Verificar valores
      console.log('[PlanoAcaoRetencao] unidadeId recebido:', unidadeId);
      console.log('[PlanoAcaoRetencao] unidadeUUID convertido:', unidadeUUID);
      console.log('[PlanoAcaoRetencao] nomeUnidade:', nomeUnidade);
      console.log('[PlanoAcaoRetencao] isConsolidado:', isConsolidado);

      // Buscar dados de retenção via função do banco
      const { data: dadosRetencao, error: errorDados } = await supabase
        .rpc('get_dados_retencao_ia', {
          p_unidade_id: unidadeUUID,
          p_ano: ano,
          p_mes: mes
        });

      if (errorDados) {
        console.error('Erro ao buscar dados:', errorDados);
        throw new Error('Erro ao buscar dados de retenção');
      }

      // Chamar Edge Function
      const { data: responseData, error: errorEdge } = await supabase.functions.invoke(
        'gemini-insights-retencao',
        {
          body: {
            dados: dadosRetencao,
            unidade_nome: isConsolidado ? undefined : nomeUnidade,
            is_consolidado: isConsolidado
          }
        }
      );

      if (errorEdge) {
        console.error('Erro na Edge Function:', errorEdge);
        throw new Error('Erro ao gerar análise');
      }

      if (responseData?.success && responseData?.insights) {
        setInsights(responseData.insights);
      } else {
        throw new Error(responseData?.error || 'Resposta inválida da IA');
      }
    } catch (err) {
      console.error('Erro:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  const getSaudeColor = (saude: string) => {
    switch (saude) {
      case 'excelente': return 'text-emerald-400 bg-emerald-500/10';
      case 'saudavel': return 'text-cyan-400 bg-cyan-500/10';
      case 'atencao': return 'text-amber-400 bg-amber-500/10';
      case 'critica': return 'text-rose-400 bg-rose-500/10';
      default: return 'text-slate-400 bg-slate-500/10';
    }
  };

  const getSaudeLabel = (saude: string) => {
    switch (saude) {
      case 'excelente': return '🌟 Excelente';
      case 'saudavel': return '✅ Saudável';
      case 'atencao': return '⚠️ Atenção';
      case 'critica': return '🚨 Crítica';
      default: return saude;
    }
  };

  const getTipoAcaoIcon = (tipo: string) => {
    switch (tipo) {
      case 'ligacao': return <Phone className="w-4 h-4" />;
      case 'mensagem': return <MessageSquare className="w-4 h-4" />;
      case 'reuniao': return <Users className="w-4 h-4" />;
      case 'processo': return <Settings className="w-4 h-4" />;
      default: return <Zap className="w-4 h-4" />;
    }
  };

  const getSeveridadeStyle = (severidade: string) => {
    switch (severidade) {
      case 'critico': return 'border-rose-500/30 bg-rose-500/10 text-rose-400';
      case 'atencao': return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
      case 'info': return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400';
      default: return 'border-slate-500/30 bg-slate-500/10 text-slate-400';
    }
  };

  return (
    <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-800/50 transition-colors"
        onClick={() => setExpandido(!expandido)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-500/20 rounded-xl">
            <Brain className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Plano de Ação Inteligente
              <Sparkles className="w-4 h-4 text-violet-400" />
            </h3>
            <p className="text-sm text-slate-400">
              Análise de retenção e sugestões para a equipe DM
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!insights && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                gerarAnalise();
              }}
              disabled={loading}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar Análise
                </>
              )}
            </Button>
          )}
          {expandido ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </div>

      {/* Conteúdo */}
      {expandido && (
        <div className="px-6 pb-6">
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 mb-4">
              <p className="font-medium">Erro ao gerar análise</p>
              <p className="text-sm opacity-80">{error}</p>
              <Button
                onClick={gerarAnalise}
                variant="outline"
                size="sm"
                className="mt-2 border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
              >
                Tentar novamente
              </Button>
            </div>
          )}

          {!insights && !loading && !error && (
            <div className="text-center py-12">
              <Brain className="w-16 h-16 text-violet-400/30 mx-auto mb-4" />
              <p className="text-slate-400 mb-2">
                Clique em "Gerar Análise" para receber sugestões personalizadas
              </p>
              <p className="text-sm text-slate-500">
                Baseado nos KPIs de gestão e metas definidas
              </p>
            </div>
          )}

          {loading && (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 text-violet-400 mx-auto mb-4 animate-spin" />
              <p className="text-slate-400">Analisando dados de retenção...</p>
              <p className="text-sm text-slate-500 mt-1">Isso pode levar alguns segundos</p>
            </div>
          )}

          {insights && (
            <div className="space-y-6">
              {/* Saudação e Status */}
              <div className="flex items-start justify-between gap-4 p-4 bg-gradient-to-r from-violet-500/10 to-purple-500/10 rounded-xl border border-violet-500/20">
                <div className="flex-1">
                  <p className="text-white text-lg">{insights.saudacao_motivacional}</p>
                </div>
                <div className={cn(
                  'px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap',
                  getSaudeColor(insights.saude_retencao)
                )}>
                  {getSaudeLabel(insights.saude_retencao)}
                </div>
              </div>

              {/* Conquistas */}
              {insights.conquistas && insights.conquistas.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    Conquistas
                  </h4>
                  <div className="grid gap-2">
                    {insights.conquistas.map((conquista, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl"
                      >
                        <span className="text-2xl">{conquista.emoji}</span>
                        <div>
                          <p className="font-medium text-emerald-400">{conquista.titulo}</p>
                          <p className="text-sm text-slate-400">{conquista.descricao}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Alertas Urgentes */}
              {insights.alertas_urgentes && insights.alertas_urgentes.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    Alertas Urgentes
                  </h4>
                  <div className="grid gap-2">
                    {insights.alertas_urgentes.map((alerta, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          'p-3 rounded-xl border',
                          getSeveridadeStyle(alerta.severidade)
                        )}
                      >
                        <p className="font-medium">{alerta.titulo}</p>
                        <p className="text-sm opacity-80">{alerta.descricao}</p>
                        <p className="text-sm mt-2 font-medium">
                          👉 {alerta.acao_imediata}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Renovações Próximas */}
              {insights.renovacoes_proximas && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-cyan-400" />
                    Renovações Próximas
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center">
                      <p className="text-2xl font-bold text-rose-400">{insights.renovacoes_proximas.total_7_dias}</p>
                      <p className="text-xs text-slate-400">Próximos 7 dias</p>
                    </div>
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                      <p className="text-2xl font-bold text-amber-400">{insights.renovacoes_proximas.total_15_dias}</p>
                      <p className="text-xs text-slate-400">Próximos 15 dias</p>
                    </div>
                    <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-center">
                      <p className="text-2xl font-bold text-cyan-400">{insights.renovacoes_proximas.total_30_dias}</p>
                      <p className="text-xs text-slate-400">Próximos 30 dias</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-400 p-2 bg-slate-800/50 rounded-lg">
                    💡 {insights.renovacoes_proximas.acao_sugerida}
                  </p>
                </div>
              )}

              {/* Análise de KPIs */}
              {insights.analise_kpis && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Target className="w-4 h-4 text-violet-400" />
                    Análise de KPIs
                  </h4>
                  <div className="p-4 bg-slate-800/50 rounded-xl space-y-3">
                    <p className="text-slate-300">{insights.analise_kpis.resumo}</p>
                    
                    {insights.analise_kpis.comparativo_mes_anterior && (
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-700/50">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">vs Mês Anterior</p>
                          {insights.analise_kpis.comparativo_mes_anterior.melhorias?.map((m, i) => (
                            <p key={i} className="text-sm text-emerald-400 flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" /> {m}
                            </p>
                          ))}
                          {insights.analise_kpis.comparativo_mes_anterior.pioras?.map((p, i) => (
                            <p key={i} className="text-sm text-rose-400 flex items-center gap-1">
                              <TrendingDown className="w-3 h-3" /> {p}
                            </p>
                          ))}
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Sazonalidade</p>
                          <p className="text-sm text-slate-400">
                            {insights.analise_kpis.comparativo_ano_anterior?.observacao}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Plano de Ação Semanal */}
              {insights.plano_acao_semanal && insights.plano_acao_semanal.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    Plano de Ação Semanal
                  </h4>
                  <div className="space-y-2">
                    {insights.plano_acao_semanal.map((acao, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/30"
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-500/20 text-violet-400 font-bold text-sm">
                          {acao.prioridade}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {getTipoAcaoIcon(acao.tipo)}
                            <p className="font-medium text-white">{acao.titulo}</p>
                          </div>
                          <p className="text-sm text-slate-400">{acao.descricao}</p>
                          <p className="text-xs text-emerald-400 mt-1">
                            ✨ {acao.impacto_esperado}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Insights de Fidelização */}
              {insights.insights_fidelizacao && insights.insights_fidelizacao.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-400" />
                    Insights de Fidelização
                  </h4>
                  <div className="grid gap-2">
                    {insights.insights_fidelizacao.map((insight, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl"
                      >
                        <p className="text-sm text-slate-300">💡 {insight.insight}</p>
                        <p className="text-sm text-amber-400 mt-1">
                          👉 {insight.acao_sugerida}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dica do Dia */}
              {insights.dica_do_dia && (
                <div className="p-4 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-xl border border-cyan-500/20">
                  <p className="text-sm font-medium text-cyan-400 mb-1">💎 Dica do Dia</p>
                  <p className="text-slate-300">{insights.dica_do_dia}</p>
                </div>
              )}

              {/* Mensagem Final */}
              {insights.mensagem_final && (
                <div className="text-center p-4 bg-violet-500/10 rounded-xl border border-violet-500/20">
                  <p className="text-violet-300 font-medium">{insights.mensagem_final}</p>
                </div>
              )}

              {/* Botão para nova análise */}
              <div className="flex justify-center pt-4">
                <Button
                  onClick={gerarAnalise}
                  variant="outline"
                  className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar Nova Análise
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
