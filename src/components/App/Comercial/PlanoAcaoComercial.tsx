'use client';

import React, { useState, useEffect } from 'react';
import { 
  Brain, Sparkles, Loader2, Phone, MessageSquare, Users, Settings,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Target,
  Lightbulb, Calendar, ChevronDown, ChevronUp, Trophy, Zap,
  Megaphone, BarChart3, UserCheck, Save, History, Trash2, Clock
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

// Mapeamento de códigos legados para UUIDs
const CODIGO_UUID_MAP: Record<string, string> = {
  'bar': '368d47f5-2d88-4475-bc14-ba084a9a348e',
  'cg': '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  'rec': '95553e96-971b-4590-a6eb-0201d013c14d',
};

function getUnidadeUUID(unidadeId: string | null): string | null {
  if (!unidadeId || unidadeId === 'todos') return null;
  if (unidadeId.includes('-')) return unidadeId;
  return CODIGO_UUID_MAP[unidadeId] || unidadeId;
}

function getUnidadeNome(unidadeId: string | null): string {
  if (!unidadeId || unidadeId === 'todos') return 'Consolidado';
  if (UUID_NOME_MAP[unidadeId]) return UUID_NOME_MAP[unidadeId];
  const uuid = CODIGO_UUID_MAP[unidadeId];
  if (uuid && UUID_NOME_MAP[uuid]) return UUID_NOME_MAP[uuid];
  return unidadeId;
}

interface Conquista {
  tipo: 'meta_batida' | 'melhoria' | 'destaque' | 'recorde';
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
  tipo: 'follow_up' | 'campanha' | 'processo' | 'treinamento';
  titulo: string;
  descricao: string;
  impacto_esperado: string;
}

interface CanalDestaque {
  canal: string;
  performance: 'excelente' | 'bom' | 'regular' | 'ruim';
  sugestao: string;
}

interface ProfessorDestaque {
  nome: string;
  merito: string;
  sugestao: string;
}

interface SugestaoCampanha {
  tipo: 'indicacao' | 'promocao' | 'evento' | 'parceria' | 'remarketing';
  titulo: string;
  descricao: string;
  canal_foco: string;
}

interface InsightsComercial {
  saudacao: string;
  saude_comercial: 'critica' | 'fria' | 'morna' | 'quente' | 'on_fire';
  conquistas: string[];
  alertas_urgentes: string[];
  analise_funil: {
    gargalo_principal: string;
    oportunidade: string;
    acao_imediata: string;
  };
  ritmo: {
    atual: string;
    necessario: string;
    projecao: string;
  };
  competitividade?: {
    provocacao: string;
    desafio: string;
  };
  matriculador_plus?: {
    estrelas_provaveis: number;
    proxima_estrela: string;
    dica_experiencia: string;
  };
  canais_destaque: string[];
  professores_destaque: string[];
  plano_acao_semanal: Array<{
    dia: string;
    acao: string;
    meta_dia: string;
  }>;
  sugestoes_campanha: SugestaoCampanha[];
  dica_do_dia: string;
  mensagem_final: string;
  metadata?: {
    unidade: string;
    hunter: string;
    apelido?: string;
    is_super_admin: boolean;
    competencia: string;
    gerado_em: string;
  };
}

interface PlanoAcaoComercialProps {
  unidadeId: string;
  ano: number;
  mes: number;
}

// Interface para insights salvos
interface InsightSalvo {
  id: string;
  tipo: string;
  unidade_id: string | null;
  ano: number;
  mes: number;
  dados: InsightsComercial;
  titulo: string | null;
  created_at: string;
}

// Chave para sessionStorage
const getSessionKey = (unidadeId: string, ano: number, mes: number) => 
  `insights_comercial_${unidadeId}_${ano}_${mes}`;

export function PlanoAcaoComercial({ unidadeId, ano, mes }: PlanoAcaoComercialProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [insights, setInsights] = useState<InsightsComercial | null>(null);
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
        .eq('tipo', 'comercial')
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
          tipo: 'comercial',
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
      const unidadeUUID = getUnidadeUUID(unidadeId);
      const nomeUnidade = getUnidadeNome(unidadeId);
      const isConsolidado = unidadeId === 'todos';

      console.log('[PlanoAcaoComercial] unidadeId:', unidadeId);
      console.log('[PlanoAcaoComercial] unidadeUUID:', unidadeUUID);
      console.log('[PlanoAcaoComercial] nomeUnidade:', nomeUnidade);

      // Chamar Edge Function diretamente (ela busca os dados internamente)
      const { data: responseData, error: errorEdge } = await supabase.functions.invoke(
        'gemini-insights-comercial',
        {
          body: {
            unidade_id: isConsolidado ? 'todos' : unidadeUUID,
            ano: ano,
            mes: mes
          }
        }
      );

      if (errorEdge) {
        console.error('Erro na Edge Function:', errorEdge);
        throw new Error('Erro ao gerar análise');
      }

      // A Edge Function retorna diretamente os insights
      if (responseData && !responseData.error) {
        setInsights(responseData);
        // Salvar na sessão automaticamente
        const sessionKey = getSessionKey(unidadeId, ano, mes);
        sessionStorage.setItem(sessionKey, JSON.stringify(responseData));
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
      case 'morna': return 'text-cyan-400 bg-cyan-500/10';
      case 'fria': return 'text-amber-400 bg-amber-500/10';
      case 'critica': return 'text-rose-400 bg-rose-500/10';
      default: return 'text-slate-400 bg-slate-500/10';
    }
  };

  const getSaudeLabel = (saude: string) => {
    switch (saude) {
      case 'on_fire': return '🔥 On Fire!';
      case 'quente': return '🎯 Quente';
      case 'morna': return '⚡ Morna';
      case 'fria': return '❄️ Fria';
      case 'critica': return '🚨 Crítica';
      default: return saude;
    }
  };

  const getTipoAcaoIcon = (tipo: string) => {
    switch (tipo) {
      case 'follow_up': return <Phone className="w-4 h-4" />;
      case 'campanha': return <Megaphone className="w-4 h-4" />;
      case 'processo': return <Settings className="w-4 h-4" />;
      case 'treinamento': return <Users className="w-4 h-4" />;
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

  const getPerformanceStyle = (performance: string) => {
    switch (performance) {
      case 'excelente': return 'text-emerald-400';
      case 'bom': return 'text-cyan-400';
      case 'regular': return 'text-amber-400';
      case 'ruim': return 'text-rose-400';
      default: return 'text-slate-400';
    }
  };

  const getRitmoStyle = (status: string) => {
    switch (status) {
      case 'acima_meta': return 'text-emerald-400 bg-emerald-500/10';
      case 'na_meta': return 'text-cyan-400 bg-cyan-500/10';
      case 'abaixo_meta': return 'text-rose-400 bg-rose-500/10';
      default: return 'text-slate-400 bg-slate-500/10';
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
          <div className="p-2 bg-orange-500/20 rounded-xl">
            <Brain className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Plano de Ação Inteligente
              <Sparkles className="w-4 h-4 text-orange-400" />
            </h3>
            <p className="text-sm text-slate-400">
              Análise geral e sugestões estratégicas para a coordenação
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
              className="bg-orange-600 hover:bg-orange-700"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar Plano
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
              <History className="w-4 h-4 text-cyan-400" />
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
              <Loader2 className="w-6 h-6 text-cyan-400 mx-auto animate-spin" />
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
              <Brain className="w-16 h-16 text-orange-400/30 mx-auto mb-4" />
              <p className="text-slate-400 mb-2">
                Clique em "Gerar Plano" para receber sugestões personalizadas
              </p>
              <p className="text-sm text-slate-500">
                Baseado nos seus dados e metas definidas
              </p>
            </div>
          )}

          {loading && (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 text-orange-400 mx-auto mb-4 animate-spin" />
              <p className="text-slate-400">Analisando dados comerciais...</p>
              <p className="text-sm text-slate-500 mt-1">Isso pode levar alguns segundos</p>
            </div>
          )}

          {insights && (
            <div className="space-y-6">
              {/* Saudação e Status */}
              <div className="flex items-start justify-between gap-4 p-4 bg-gradient-to-r from-orange-500/10 to-amber-500/10 rounded-xl border border-orange-500/20">
                <div className="flex-1">
                  <p className="text-white text-lg">{insights.saudacao}</p>
                  {insights.metadata?.hunter && !insights.metadata?.is_super_admin && (
                    <p className="text-xs text-orange-400/70 mt-1">
                      🎯 {insights.metadata.hunter} • {insights.metadata.unidade}
                    </p>
                  )}
                </div>
                <div className={cn(
                  'px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap',
                  getSaudeColor(insights.saude_comercial)
                )}>
                  {getSaudeLabel(insights.saude_comercial)}
                </div>
              </div>

              {/* Competitividade e Provocação (apenas para Hunters) */}
              {insights.competitividade && (
                <div className="p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl border border-purple-500/20">
                  <h4 className="text-sm font-semibold text-purple-300 flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4" />
                    Desafio Hunter
                  </h4>
                  <p className="text-slate-300">{insights.competitividade.provocacao}</p>
                  <p className="text-sm text-purple-400 mt-2 font-medium">
                    🔥 {insights.competitividade.desafio}
                  </p>
                </div>
              )}

              {/* Matriculador+ LA (apenas para Hunters) */}
              {insights.matriculador_plus && (
                <div className="p-4 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 rounded-xl border border-amber-500/20">
                  <h4 className="text-sm font-semibold text-amber-300 flex items-center gap-2 mb-3">
                    <Trophy className="w-4 h-4" />
                    Matriculador+ LA
                  </h4>
                  <div className="flex items-center gap-4 mb-3">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <span key={i} className={cn(
                          'text-2xl',
                          i <= insights.matriculador_plus!.estrelas_provaveis ? 'opacity-100' : 'opacity-30'
                        )}>
                          ⭐
                        </span>
                      ))}
                    </div>
                    <span className="text-amber-400 font-bold">
                      {insights.matriculador_plus.estrelas_provaveis}/5 estrelas
                    </span>
                  </div>
                  <p className="text-sm text-slate-300">
                    <span className="text-amber-400 font-medium">Próxima estrela:</span> {insights.matriculador_plus.proxima_estrela}
                  </p>
                  <p className="text-sm text-yellow-400 mt-2 italic">
                    ✨ {insights.matriculador_plus.dica_experiencia}
                  </p>
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
                        <p className="font-medium text-emerald-400">{conquista}</p>
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
                        className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400"
                      >
                        <p className="font-medium">⚠️ {alerta}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Análise do Funil */}
              {insights.analise_funil && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                    Análise do Funil
                  </h4>
                  <div className="p-4 bg-slate-800/50 rounded-xl space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">🚧 Gargalo Principal</p>
                        <p className="text-sm text-amber-400">{insights.analise_funil.gargalo_principal}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">💎 Oportunidade</p>
                        <p className="text-sm text-emerald-400">{insights.analise_funil.oportunidade}</p>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-700/50">
                      <p className="text-xs text-slate-500 mb-1">👉 Ação Imediata</p>
                      <p className="text-sm text-cyan-400 font-medium">{insights.analise_funil.acao_imediata}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Ritmo e Projeção */}
              {insights.ritmo && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Target className="w-4 h-4 text-violet-400" />
                    Ritmo e Projeção
                  </h4>
                  <div className="p-4 bg-slate-800/50 rounded-xl">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Atual</p>
                        <p className="text-lg font-bold text-white">{insights.ritmo.atual}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Necessário</p>
                        <p className="text-lg font-bold text-amber-400">{insights.ritmo.necessario}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Projeção</p>
                        <p className="text-sm font-medium text-cyan-400">{insights.ritmo.projecao}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Canais em Destaque */}
              {insights.canais_destaque && insights.canais_destaque.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-pink-400" />
                    Canais em Destaque
                  </h4>
                  <div className="grid gap-2">
                    {insights.canais_destaque.map((canal, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-xl"
                      >
                        <span className="text-pink-400">📱</span>
                        <p className="text-sm text-slate-300">{canal}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Professores em Destaque */}
              {insights.professores_destaque && insights.professores_destaque.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    Professores Matriculadores
                  </h4>
                  <div className="grid gap-2">
                    {insights.professores_destaque.map((prof, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl"
                      >
                        <span className="text-emerald-400">🎸</span>
                        <p className="text-sm text-emerald-400">{prof}</p>
                      </div>
                    ))}
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
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-orange-500/20 text-orange-400 font-bold text-xs">
                          {acao.dia}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-white">{acao.acao}</p>
                          <p className="text-xs text-emerald-400 mt-1">
                            🎯 Meta: {acao.meta_dia}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sugestões de Campanha */}
              {insights.sugestoes_campanha && insights.sugestoes_campanha.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-400" />
                    Sugestões de Campanha
                  </h4>
                  <div className="grid gap-2">
                    {insights.sugestoes_campanha.map((campanha, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                            {campanha.tipo}
                          </span>
                          <span className="text-xs text-slate-500">Canal: {campanha.canal_foco}</span>
                        </div>
                        <p className="font-medium text-amber-400">{campanha.titulo}</p>
                        <p className="text-sm text-slate-400 mt-1">{campanha.descricao}</p>
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
                <div className="text-center p-4 bg-orange-500/10 rounded-xl border border-orange-500/20">
                  <p className="text-orange-300 font-medium">{insights.mensagem_final}</p>
                </div>
              )}

              {/* Botões de ação */}
              <div className="flex justify-center gap-3 pt-4">
                <Button
                  onClick={salvarInsights}
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
                  onClick={gerarAnalise}
                  disabled={loading}
                  variant="outline"
                  className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
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
