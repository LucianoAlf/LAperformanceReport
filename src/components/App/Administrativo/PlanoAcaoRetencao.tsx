'use client';

import React, { useState, useEffect } from 'react';
import { 
  Brain, Sparkles, Loader2, Phone, MessageSquare, Users, Settings,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Target,
  Lightbulb, Calendar, ChevronDown, ChevronUp, Trophy, Zap,
  Save, History, Trash2, Clock, Star
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

// Estrutura igual ao comercial, adaptada para retenção
interface PlanoAcaoSemanal {
  dia: string;
  acao: string;
  meta_dia: string;
  prioridade?: number;
  tipo?: string;
  meta_quantitativa?: string;
}

interface SugestaoRetencao {
  titulo: string;
  descricao: string;
  foco: string;
}

// Novas interfaces para dados expandidos
interface KPIAnalise {
  nome: string;
  atual: number;
  meta: number | null;
  status: 'bateu' | 'proximo' | 'longe' | 'sem_meta';
  variacao_mes_anterior?: number | null;
  analise: string;
  acao_sugerida: string;
}

interface PainelMetas {
  resumo_geral: string;
  metas_batidas: number;
  metas_total: number;
  kpis: KPIAnalise[];
}

interface EvasoesAnalise {
  total_recente: number;
  principais_motivos: string[];
  perfil_risco: string;
  acao_preventiva: string;
}

interface PermanenciaAnalise {
  faixa_critica: string;
  quantidade_risco: number;
  estrategia: string;
}

interface RenovacoesProximas {
  total_vencidos?: number;
  total_7_dias: number;
  total_15_dias: number;
  total_30_dias: number;
  acao_sugerida: string;
  script_ligacao?: string;
}

interface FidelizaPlusDetalhe {
  estrela: string;
  status: 'conquistada' | 'proxima' | 'longe';
  atual: number;
  meta: number;
  falta: string;
}

interface InsightsRetencao {
  saudacao: string;
  saude_retencao: 'on_fire' | 'quente' | 'morna' | 'fria' | 'critica';
  conquistas: string[];
  alertas_urgentes: string[];
  desafio_farmer?: {
    provocacao: string;
    meta_desafio: string;
  } | null;
  fideliza_plus?: {
    estrelas_conquistadas: number;
    estrelas_possiveis: number;
    proxima_estrela: string;
    dica_experiencia: string;
    detalhamento?: FidelizaPlusDetalhe[];
  } | null;
  analise_retencao?: {
    gargalo_principal: string;
    oportunidade: string;
    acao_imediata: string;
  } | null;
  ritmo?: {
    atual: string;
    necessario: string;
    projecao: string;
  } | null;
  // Novos campos expandidos
  painel_metas?: PainelMetas | null;
  renovacoes_proximas?: RenovacoesProximas | null;
  evasoes_analise?: EvasoesAnalise | null;
  permanencia_analise?: PermanenciaAnalise | null;
  // Campos existentes
  renovacoes_destaque?: string[];
  alunos_risco?: string[];
  plano_acao_semanal: PlanoAcaoSemanal[];
  sugestoes_retencao?: SugestaoRetencao[];
  dica_do_dia: string;
  mensagem_final: string;
  metadata?: {
    unidade: string;
    farmers: string;
    apelidos: string | null;
    is_super_admin: boolean;
    competencia: string;
    gerado_em: string;
  };
}

// Interface para insights salvos
interface InsightSalvo {
  id: string;
  tipo: string;
  unidade_id: string | null;
  ano: number;
  mes: number;
  dados: InsightsRetencao;
  titulo: string | null;
  created_at: string;
}

// Chave para sessionStorage
const getSessionKey = (unidadeId: string, ano: number, mes: number) => 
  `insights_retencao_${unidadeId}_${ano}_${mes}`;

interface PlanoAcaoRetencaoProps {
  unidadeId: string;
  ano: number;
  mes: number;
}

export function PlanoAcaoRetencao({ unidadeId, ano, mes }: PlanoAcaoRetencaoProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [insights, setInsights] = useState<InsightsRetencao | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandido, setExpandido] = useState(true);
  const [showHistorico, setShowHistorico] = useState(false);
  const [historico, setHistorico] = useState<InsightSalvo[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // Carregar insights da sessão ao montar ou quando mudar filtros
  useEffect(() => {
    const sessionKey = getSessionKey(unidadeId, ano, mes);
    const saved = sessionStorage.getItem(sessionKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setInsights(parsed);
      } catch (e) {
        console.error('Erro ao carregar insights da sessão:', e);
      }
    } else {
      setInsights(null);
    }
  }, [unidadeId, ano, mes]);

  // Salvar insights na sessão quando mudar
  useEffect(() => {
    if (insights) {
      const sessionKey = getSessionKey(unidadeId, ano, mes);
      sessionStorage.setItem(sessionKey, JSON.stringify(insights));
    }
  }, [insights, unidadeId, ano, mes]);

  // Buscar histórico de insights salvos
  async function carregarHistorico() {
    setLoadingHistorico(true);
    try {
      const unidadeUUID = getUnidadeUUID(unidadeId);
      const { data, error } = await supabase
        .from('insights_salvos')
        .select('*')
        .eq('tipo', 'retencao')
        .eq('ano', ano)
        .eq('mes', mes)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setHistorico(data || []);
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
    } finally {
      setLoadingHistorico(false);
    }
  }

  // Salvar insights no banco de dados
  async function salvarInsights() {
    if (!insights) return;
    
    setSaving(true);
    setSavedMessage(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const unidadeUUID = getUnidadeUUID(unidadeId);
      const titulo = `Análise ${getUnidadeNome(unidadeId)} - ${mes.toString().padStart(2, '0')}/${ano}`;

      const { error } = await supabase
        .from('insights_salvos')
        .insert({
          user_id: user.id,
          tipo: 'retencao',
          unidade_id: unidadeUUID,
          ano,
          mes,
          dados: insights,
          titulo
        });

      if (error) throw error;
      
      setSavedMessage('Análise salva com sucesso!');
      setTimeout(() => setSavedMessage(null), 3000);
      
      // Recarregar histórico se estiver aberto
      if (showHistorico) {
        carregarHistorico();
      }
    } catch (err) {
      console.error('Erro ao salvar:', err);
      setSavedMessage('Erro ao salvar análise');
      setTimeout(() => setSavedMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  // Carregar insight do histórico
  function carregarDoHistorico(item: InsightSalvo) {
    setInsights(item.dados);
    setShowHistorico(false);
  }

  // Deletar insight do histórico
  async function deletarDoHistorico(id: string) {
    try {
      const { error } = await supabase
        .from('insights_salvos')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setHistorico(prev => prev.filter(h => h.id !== id));
    } catch (err) {
      console.error('Erro ao deletar:', err);
    }
  }

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
        // Normalizar resposta para estrutura igual ao comercial
        const raw = responseData.insights;
        const normalizado: InsightsRetencao = {
          saudacao: raw.saudacao || raw.saudacao_motivacional || '',
          saude_retencao: raw.saude_retencao || raw.saude_gestao || 'morna',
          conquistas: Array.isArray(raw.conquistas) 
            ? raw.conquistas.map((c: any) => typeof c === 'string' ? c : `${c.emoji || '🏆'} ${c.titulo}: ${c.descricao}`)
            : [],
          alertas_urgentes: Array.isArray(raw.alertas_urgentes)
            ? raw.alertas_urgentes.map((a: any) => typeof a === 'string' ? a : `${a.titulo || ''}: ${a.descricao || ''}`)
            : [],
          desafio_farmer: raw.desafio_farmer || raw.competitividade || null,
          fideliza_plus: raw.fideliza_plus ? {
            estrelas_conquistadas: raw.fideliza_plus.estrelas_conquistadas || 0,
            estrelas_possiveis: raw.fideliza_plus.estrelas_possiveis || 4,
            proxima_estrela: raw.fideliza_plus.proxima_estrela || '',
            dica_experiencia: raw.fideliza_plus.dica_experiencia || '',
            detalhamento: raw.fideliza_plus.detalhamento || undefined
          } : null,
          analise_retencao: raw.analise_retencao || raw.analise_funil || null,
          ritmo: raw.ritmo ? {
            atual: raw.ritmo.atual || `${raw.ritmo.renovacoes_realizadas || 0} renovações`,
            necessario: raw.ritmo.necessario || raw.ritmo.ritmo_necessario || '',
            projecao: raw.ritmo.projecao || ''
          } : null,
          // Novos campos expandidos
          painel_metas: raw.painel_metas || null,
          renovacoes_proximas: raw.renovacoes_proximas || null,
          evasoes_analise: raw.evasoes_analise || null,
          permanencia_analise: raw.permanencia_analise || null,
          // Campos existentes
          renovacoes_destaque: raw.renovacoes_destaque || [],
          alunos_risco: raw.alunos_risco || [],
          plano_acao_semanal: Array.isArray(raw.plano_acao_semanal || raw.plano_action_semanal)
            ? (raw.plano_acao_semanal || raw.plano_action_semanal).map((p: any, idx: number) => ({
                dia: p.dia || ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][idx] || `Dia ${idx + 1}`,
                acao: p.acao || p.titulo || p.foco || p.descricao || '',
                meta_dia: p.meta_dia || p.meta_quantitativa || '',
                prioridade: p.prioridade,
                tipo: p.tipo
              }))
            : [],
          sugestoes_retencao: raw.sugestoes_retencao || raw.sugestoes_campanha || [],
          dica_do_dia: raw.dica_do_dia || '',
          mensagem_final: raw.mensagem_final || '',
          metadata: raw.metadata
        };
        
        console.log('[PlanoAcaoRetencao] Resposta normalizada:', normalizado);
        setInsights(normalizado);
        const sessionKey = getSessionKey(unidadeId, ano, mes);
        sessionStorage.setItem(sessionKey, JSON.stringify(normalizado));
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
      case 'on_fire': return 'text-orange-400 bg-orange-500/10';
      case 'quente': return 'text-emerald-400 bg-emerald-500/10';
      case 'morna': return 'text-amber-400 bg-amber-500/10';
      case 'fria': return 'text-cyan-400 bg-cyan-500/10';
      case 'critica': return 'text-rose-400 bg-rose-500/10';
      default: return 'text-slate-400 bg-slate-500/10';
    }
  };

  const getSaudeLabel = (saude: string) => {
    switch (saude) {
      case 'on_fire': return '🔥 On Fire';
      case 'quente': return '🌟 Quente';
      case 'morna': return '⚠️ Morna';
      case 'fria': return '❄️ Fria';
      case 'critica': return '🚨 Crítica';
      default: return saude;
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
        <div className="flex items-center gap-2">
          {/* Botão Histórico */}
          <Button
            onClick={(e) => {
              e.stopPropagation();
              setShowHistorico(!showHistorico);
              if (!showHistorico) carregarHistorico();
            }}
            variant="outline"
            size="sm"
            className="border-slate-600 text-slate-400 hover:bg-slate-700"
          >
            <History className="w-4 h-4" />
          </Button>
          
          {/* Botão Salvar (só aparece se tiver insights) */}
          {insights && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                salvarInsights();
              }}
              disabled={saving}
              variant="outline"
              size="sm"
              className="border-emerald-600 text-emerald-400 hover:bg-emerald-500/10"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
            </Button>
          )}
          
          {/* Botão Gerar (só aparece se não tiver insights) */}
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

      {/* Mensagem de salvamento */}
      {savedMessage && (
        <div className={cn(
          'mx-6 mb-2 p-2 rounded-lg text-sm text-center',
          savedMessage.includes('sucesso') 
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
            : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
        )}>
          {savedMessage}
        </div>
      )}

      {/* Painel de Histórico */}
      {showHistorico && (
        <div className="mx-6 mb-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <History className="w-4 h-4 text-violet-400" />
              Análises Salvas
            </h4>
            <Button
              onClick={() => setShowHistorico(false)}
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-white"
            >
              ✕
            </Button>
          </div>
          
          {loadingHistorico ? (
            <div className="text-center py-4">
              <Loader2 className="w-6 h-6 text-violet-400 mx-auto animate-spin" />
            </div>
          ) : historico.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">
              Nenhuma análise salva para este período
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {historico.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  <div 
                    className="flex-1 cursor-pointer"
                    onClick={() => carregarDoHistorico(item)}
                  >
                    <p className="text-sm text-white font-medium">
                      {item.titulo || 'Análise sem título'}
                    </p>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <Button
                    onClick={() => deletarDoHistorico(item.id)}
                    variant="ghost"
                    size="sm"
                    className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
              {/* Saudação e Status - igual ao comercial */}
              <div className="flex items-start justify-between gap-4 p-4 bg-gradient-to-r from-violet-500/10 to-purple-500/10 rounded-xl border border-violet-500/20">
                <div className="flex-1">
                  <p className="text-white text-lg">{String(insights.saudacao || '')}</p>
                  {insights.metadata && (
                    <p className="text-xs text-violet-400 mt-1">🏢 {insights.metadata.farmers} • {insights.metadata.unidade}</p>
                  )}
                </div>
                <div className={cn(
                  'px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap',
                  getSaudeColor(insights.saude_retencao)
                )}>
                  {getSaudeLabel(insights.saude_retencao)}
                </div>
              </div>

              {/* Desafio Farmer - igual ao Desafio Hunter do comercial */}
              {insights.desafio_farmer && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-orange-400" />
                    Desafio Farmer
                  </h4>
                  <div className="p-4 bg-gradient-to-r from-orange-500/10 to-red-500/10 rounded-xl border border-orange-500/20">
                    <p className="text-orange-300 font-medium mb-2">
                      🔥 {String(insights.desafio_farmer.provocacao || '')}
                    </p>
                    <p className="text-sm text-amber-400">
                      🎯 {String(insights.desafio_farmer.meta_desafio || '')}
                    </p>
                  </div>
                </div>
              )}

              {/* Fideliza+ LA - igual ao Matriculador+ do comercial */}
              {insights.fideliza_plus && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-400" />
                    Fideliza+ LA
                  </h4>
                  <div className="p-4 bg-gradient-to-r from-yellow-500/10 to-amber-500/10 rounded-xl border border-yellow-500/20">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1">
                        {[...Array(4)].map((_, i) => (
                          <Star
                            key={i}
                            className={cn(
                              'w-5 h-5',
                              i < (insights.fideliza_plus?.estrelas_conquistadas || 0)
                                ? 'text-yellow-400 fill-yellow-400'
                                : 'text-slate-600'
                            )}
                          />
                        ))}
                      </div>
                      <span className="text-sm text-yellow-400 font-medium">
                        {insights.fideliza_plus.estrelas_conquistadas}/{insights.fideliza_plus.estrelas_possiveis} estrelas
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 mb-2">
                      🎯 Próxima estrela: <span className="text-yellow-400 font-medium">{String(insights.fideliza_plus.proxima_estrela || '')}</span>
                    </p>
                    <p className="text-sm text-amber-300">
                      ✨ {String(insights.fideliza_plus.dica_experiencia || '')}
                    </p>
                  </div>
                </div>
              )}

              {/* NOVO: Painel de Metas - Análise detalhada de KPIs vs Metas */}
              {insights.painel_metas && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Target className="w-4 h-4 text-violet-400" />
                    Painel de Metas
                    <span className="ml-auto text-xs bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full">
                      {insights.painel_metas.metas_batidas}/{insights.painel_metas.metas_total} batidas
                    </span>
                  </h4>
                  <p className="text-sm text-slate-400 italic">{String(insights.painel_metas.resumo_geral || '')}</p>
                  <div className="grid gap-2">
                    {insights.painel_metas.kpis?.map((kpi, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          'p-3 rounded-xl border',
                          kpi.status === 'bateu' ? 'bg-emerald-500/10 border-emerald-500/20' :
                          kpi.status === 'proximo' ? 'bg-amber-500/10 border-amber-500/20' :
                          kpi.status === 'longe' ? 'bg-rose-500/10 border-rose-500/20' :
                          'bg-slate-500/10 border-slate-500/20'
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-white text-sm">{kpi.nome}</span>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'text-xs px-2 py-0.5 rounded-full',
                              kpi.status === 'bateu' ? 'bg-emerald-500/20 text-emerald-400' :
                              kpi.status === 'proximo' ? 'bg-amber-500/20 text-amber-400' :
                              kpi.status === 'longe' ? 'bg-rose-500/20 text-rose-400' :
                              'bg-slate-500/20 text-slate-400'
                            )}>
                              {kpi.status === 'bateu' ? '✅ Bateu' : 
                               kpi.status === 'proximo' ? '🔶 Próximo' : 
                               kpi.status === 'longe' ? '❌ Longe' : '⚪ Sem meta'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-slate-400 mb-2">
                          <span>Atual: <strong className="text-white">{kpi.atual}</strong></span>
                          {kpi.meta && <span>Meta: <strong className="text-violet-400">{kpi.meta}</strong></span>}
                          {kpi.variacao_mes_anterior !== null && kpi.variacao_mes_anterior !== undefined && (
                            <span className={kpi.variacao_mes_anterior >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {kpi.variacao_mes_anterior >= 0 ? '↑' : '↓'} {Math.abs(kpi.variacao_mes_anterior).toFixed(1)}% vs mês anterior
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-300">{String(kpi.analise || '')}</p>
                        {kpi.acao_sugerida && (
                          <p className="text-xs text-cyan-400 mt-1">💡 {String(kpi.acao_sugerida)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                        <span className="text-2xl">🏆</span>
                        <p className="font-medium text-emerald-400">{String(conquista || '')}</p>
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
                        className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400"
                      >
                        <p className="font-medium">⚠️ {String(alerta || '')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Análise de Retenção - igual à Análise do Funil do comercial */}
              {insights.analise_retencao && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-rose-400" />
                    Análise de Retenção
                  </h4>
                  <div className="grid gap-3">
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                      <p className="text-xs text-rose-400 font-medium mb-1">📉 Gargalo Principal</p>
                      <p className="text-sm text-slate-300">{String(insights.analise_retencao.gargalo_principal || '')}</p>
                    </div>
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                      <p className="text-xs text-emerald-400 font-medium mb-1">💡 Oportunidade</p>
                      <p className="text-sm text-slate-300">{String(insights.analise_retencao.oportunidade || '')}</p>
                    </div>
                    <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                      <p className="text-xs text-cyan-400 font-medium mb-1">⚡ Ação Imediata</p>
                      <p className="text-sm text-slate-300">{String(insights.analise_retencao.acao_imediata || '')}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Ritmo e Projeção */}
              {insights.ritmo && (
                <div className="p-4 bg-gradient-to-r from-indigo-500/10 to-violet-500/10 rounded-xl border border-indigo-500/20">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-indigo-400" />
                    Ritmo e Projeção
                  </h4>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="text-center">
                      <p className="text-lg font-bold text-indigo-400">{String(insights.ritmo.atual || '')}</p>
                      <p className="text-xs text-slate-400">Atual</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-violet-400">{String(insights.ritmo.necessario || '')}</p>
                      <p className="text-xs text-slate-400">Necessário</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-purple-400">{String(insights.ritmo.projecao || '')}</p>
                      <p className="text-xs text-slate-400">Projeção</p>
                    </div>
                  </div>
                </div>
              )}

              {/* NOVO: Renovações Próximas Expandido */}
              {insights.renovacoes_proximas && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-cyan-400" />
                    Renovações Próximas
                  </h4>
                  <div className="grid grid-cols-4 gap-2">
                    {insights.renovacoes_proximas.total_vencidos !== undefined && (
                      <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center">
                        <p className="text-2xl font-bold text-rose-400">{insights.renovacoes_proximas.total_vencidos}</p>
                        <p className="text-xs text-rose-300">Vencidos</p>
                      </div>
                    )}
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center">
                      <p className="text-2xl font-bold text-amber-400">{insights.renovacoes_proximas.total_7_dias}</p>
                      <p className="text-xs text-amber-300">7 dias</p>
                    </div>
                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-center">
                      <p className="text-2xl font-bold text-yellow-400">{insights.renovacoes_proximas.total_15_dias}</p>
                      <p className="text-xs text-yellow-300">15 dias</p>
                    </div>
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                      <p className="text-2xl font-bold text-emerald-400">{insights.renovacoes_proximas.total_30_dias}</p>
                      <p className="text-xs text-emerald-300">30 dias</p>
                    </div>
                  </div>
                  <p className="text-sm text-cyan-400">💡 {String(insights.renovacoes_proximas.acao_sugerida || '')}</p>
                  {insights.renovacoes_proximas.script_ligacao && (
                    <div className="p-3 bg-slate-700/30 rounded-xl border border-slate-600/30">
                      <p className="text-xs text-slate-400 mb-1">📞 Script sugerido para ligação:</p>
                      <p className="text-sm text-slate-300 italic">"{String(insights.renovacoes_proximas.script_ligacao)}"</p>
                    </div>
                  )}
                </div>
              )}

              {/* NOVO: Análise de Evasões */}
              {insights.evasoes_analise && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-rose-400" />
                    Análise de Evasões
                    <span className="ml-auto text-xs bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full">
                      {insights.evasoes_analise.total_recente} recentes
                    </span>
                  </h4>
                  <div className="grid gap-2">
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                      <p className="text-xs text-rose-400 font-medium mb-1">📊 Principais Motivos</p>
                      <div className="flex flex-wrap gap-1">
                        {insights.evasoes_analise.principais_motivos?.map((motivo, idx) => (
                          <span key={idx} className="text-xs bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full">
                            {motivo}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                      <p className="text-xs text-amber-400 font-medium mb-1">👤 Perfil de Risco</p>
                      <p className="text-sm text-slate-300">{String(insights.evasoes_analise.perfil_risco || '')}</p>
                    </div>
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                      <p className="text-xs text-emerald-400 font-medium mb-1">🛡️ Ação Preventiva</p>
                      <p className="text-sm text-slate-300">{String(insights.evasoes_analise.acao_preventiva || '')}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* NOVO: Análise de Permanência */}
              {insights.permanencia_analise && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-violet-400" />
                    Análise de Permanência
                  </h4>
                  <div className="p-4 bg-gradient-to-r from-violet-500/10 to-purple-500/10 rounded-xl border border-violet-500/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-300">Faixa Crítica:</span>
                      <span className="text-sm font-bold text-violet-400">{String(insights.permanencia_analise.faixa_critica || '')}</span>
                    </div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-slate-300">Alunos em Risco:</span>
                      <span className="text-lg font-bold text-rose-400">{insights.permanencia_analise.quantidade_risco}</span>
                    </div>
                    <p className="text-sm text-cyan-400">💡 {String(insights.permanencia_analise.estrategia || '')}</p>
                  </div>
                </div>
              )}

              {/* Renovações em Destaque */}
              {insights.renovacoes_destaque && insights.renovacoes_destaque.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-cyan-400" />
                    Renovações em Destaque
                  </h4>
                  <div className="grid gap-2">
                    {insights.renovacoes_destaque.map((item, idx) => (
                      <div key={idx} className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                        <p className="text-sm text-cyan-300">📋 {String(item || '')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Alunos em Risco */}
              {insights.alunos_risco && insights.alunos_risco.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Users className="w-4 h-4 text-rose-400" />
                    Alunos em Risco
                  </h4>
                  <div className="grid gap-2">
                    {insights.alunos_risco.map((item, idx) => (
                      <div key={idx} className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                        <p className="text-sm text-rose-300">🎯 {String(item || '')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Plano de Ação Semanal - igual ao comercial */}
              {insights.plano_acao_semanal && insights.plano_acao_semanal.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    Plano de Ação Semanal
                  </h4>
                  <div className="grid gap-2">
                    {insights.plano_acao_semanal.map((acao, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/30"
                      >
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-violet-500/20 text-violet-400 font-bold text-xs">
                          {acao.dia?.slice(0, 3) || `D${idx + 1}`}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-medium text-white">{String(acao.dia || '')}</p>
                            <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                              🎯 {String(acao.meta_dia || '')}
                            </span>
                          </div>
                          <p className="text-sm text-slate-400">{String(acao.acao || '')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sugestões de Retenção - igual às Sugestões de Campanha do comercial */}
              {insights.sugestoes_retencao && insights.sugestoes_retencao.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-400" />
                    Sugestões de Retenção
                  </h4>
                  <div className="grid gap-2">
                    {insights.sugestoes_retencao.map((sugestao, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-amber-400">{String(sugestao.titulo || '')}</p>
                          <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded-full">
                            {String(sugestao.foco || '')}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300">{String(sugestao.descricao || '')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dica do Dia */}
              {insights.dica_do_dia && (
                <div className="p-4 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-xl border border-cyan-500/20">
                  <p className="text-sm font-medium text-cyan-400 mb-1">💎 Dica do Dia</p>
                  <p className="text-slate-300">{String(insights.dica_do_dia)}</p>
                </div>
              )}

              {/* Mensagem Final */}
              {insights.mensagem_final && (
                <div className="text-center p-4 bg-violet-500/10 rounded-xl border border-violet-500/20">
                  <p className="text-violet-300 font-medium">{String(insights.mensagem_final)}</p>
                </div>
              )}

              {/* Botões de ação */}
              <div className="flex justify-center gap-3 pt-4">
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    salvarInsights();
                  }}
                  disabled={saving}
                  variant="outline"
                  className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Salvar Análise
                </Button>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    gerarAnalise();
                  }}
                  disabled={loading}
                  variant="outline"
                  className="border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
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
