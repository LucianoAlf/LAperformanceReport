// Componente: Insights IA - Plano de Ação Inteligente
// Usa Gemini 3.0 Flash Preview via Edge Function

import React, { useState, useEffect } from 'react';
import { Brain, Sparkles, Clock, Calendar, Target, Lightbulb, ChevronDown, ChevronUp, User, Loader2, AlertTriangle, Save, Star, Trash2, Eye, X, Check, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { InputsSimulacao, ResultadoSimulacao } from '@/lib/simulador/tipos';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface InsightsIAProps {
  inputs: InputsSimulacao;
  resultado: ResultadoSimulacao | null;
  alertas: { tipo: 'success' | 'warning' | 'danger'; mensagem: string }[];
  historico?: {
    mes: string;
    leads: number;
    experimentais: number;
    matriculas: number;
    cancelamentos: number;
  }[];
  unidadeId?: string;
  unidadeNome?: string;
}

interface Acao {
  titulo: string;
  impacto: string;
  esforco: 'Baixo' | 'Médio' | 'Alto';
  passos: string[];
  meta_sucesso: string;
  responsavel: 'Gestor' | 'Farmer' | 'Hunter';
}

interface PlanoAcao {
  diagnostico: string;
  acoes_curto_prazo: Acao[];
  acoes_medio_prazo: Acao[];
  acoes_longo_prazo: Acao[];
  insights_adicionais: string[];
  error?: string;
}

interface PlanoSalvo {
  id: string;
  nome: string;
  descricao: string | null;
  ano: number;
  mes: number;
  diagnostico: string;
  acoes_curto_prazo: Acao[];
  acoes_medio_prazo: Acao[];
  acoes_longo_prazo: Acao[];
  insights_adicionais: string[];
  favorito: boolean;
  created_at: string;
}

const esforcoColors = {
  Baixo: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Médio: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Alto: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const responsavelColors = {
  Gestor: 'bg-violet-500/20 text-violet-400',
  Farmer: 'bg-cyan-500/20 text-cyan-400',
  Hunter: 'bg-orange-500/20 text-orange-400',
};

function CardAcao({ acao, index }: { acao: Acao; index: number }) {
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
          <span className={cn("text-xs px-2 py-1 rounded-full border", esforcoColors[acao.esforco])}>
            {acao.esforco}
          </span>
          <span className={cn("text-xs px-2 py-1 rounded-full", responsavelColors[acao.responsavel])}>
            {acao.responsavel}
          </span>
          {expandido ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {expandido && (
        <div className="px-4 pb-4 border-t border-slate-700/50">
          <div className="pt-3 pl-11">
            <div className="space-y-2 mb-3">
              {acao.passos.map((passo, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-slate-300">
                  <span className="text-violet-400 font-medium">{i + 1}.</span>
                  <span>{passo}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-lg">
              <Target className="w-3 h-3" />
              <span className="font-medium">Meta:</span>
              <span>{acao.meta_sucesso}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SecaoAcoes({ 
  titulo, 
  icone: Icone, 
  acoes, 
  corIcone 
}: { 
  titulo: string; 
  icone: typeof Clock; 
  acoes: Acao[]; 
  corIcone: string;
}) {
  if (acoes.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center", corIcone)}>
          <Icone className="w-3.5 h-3.5" />
        </div>
        <h3 className="font-semibold text-white text-sm">{titulo}</h3>
        <span className="text-xs text-slate-500">({acoes.length} ações)</span>
      </div>
      <div className="space-y-2">
        {acoes.map((acao, idx) => (
          <CardAcao key={idx} acao={acao} index={idx} />
        ))}
      </div>
    </div>
  );
}

export function InsightsIA({ inputs, resultado, alertas, historico, unidadeId, unidadeNome }: InsightsIAProps) {
  const [plano, setPlano] = useState<PlanoAcao | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  
  // Estados para salvar planos
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [nomePlano, setNomePlano] = useState('');
  const [descricaoPlano, setDescricaoPlano] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvoComSucesso, setSalvoComSucesso] = useState(false);
  
  // Estados para listar planos salvos
  const [planosSalvos, setPlanosSalvos] = useState<PlanoSalvo[]>([]);
  const [showPlanosSalvos, setShowPlanosSalvos] = useState(false);
  const [planoVisualizando, setPlanoVisualizando] = useState<PlanoSalvo | null>(null);
  const [loadingPlanos, setLoadingPlanos] = useState(false);
  
  // Estado para modal de confirmação de exclusão
  const [planoParaExcluir, setPlanoParaExcluir] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const mesAtual = new Date().getMonth() + 1;
  const anoAtual = new Date().getFullYear();

  // Buscar planos salvos ao montar
  useEffect(() => {
    if (unidadeId) {
      buscarPlanosSalvos();
    }
  }, [unidadeId]);

  const buscarPlanosSalvos = async () => {
    if (!unidadeId) return;
    
    setLoadingPlanos(true);
    try {
      const { data, error } = await supabase
        .from('planos_acao')
        .select('*')
        .eq('unidade_id', unidadeId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setPlanosSalvos(data || []);
    } catch (err) {
      console.error('Erro ao buscar planos:', err);
    } finally {
      setLoadingPlanos(false);
    }
  };

  const salvarPlano = async () => {
    if (!plano || !unidadeId || !nomePlano.trim()) return;

    setSalvando(true);
    try {
      const { error } = await supabase
        .from('planos_acao')
        .insert({
          unidade_id: unidadeId,
          nome: nomePlano.trim(),
          descricao: descricaoPlano.trim() || null,
          ano: anoAtual,
          mes: mesAtual,
          diagnostico: plano.diagnostico,
          acoes_curto_prazo: plano.acoes_curto_prazo,
          acoes_medio_prazo: plano.acoes_medio_prazo,
          acoes_longo_prazo: plano.acoes_longo_prazo,
          insights_adicionais: plano.insights_adicionais,
          contexto_geracao: {
            inputs,
            resultado,
            alertas,
            unidadeNome,
          },
        });

      if (error) throw error;

      setSalvoComSucesso(true);
      setShowSaveModal(false);
      setNomePlano('');
      setDescricaoPlano('');
      buscarPlanosSalvos();
      
      setTimeout(() => setSalvoComSucesso(false), 3000);
    } catch (err) {
      console.error('Erro ao salvar plano:', err);
      setErro('Erro ao salvar plano');
    } finally {
      setSalvando(false);
    }
  };

  const toggleFavorito = async (e: React.MouseEvent, planoId: string, favoritoAtual: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      const { error } = await supabase
        .from('planos_acao')
        .update({ favorito: !favoritoAtual })
        .eq('id', planoId);

      if (error) {
        console.error('Erro Supabase ao favoritar:', error);
        return;
      }
      
      // Atualizar lista localmente
      setPlanosSalvos(prev => prev.map(p => 
        p.id === planoId ? { ...p, favorito: !favoritoAtual } : p
      ));
    } catch (err) {
      console.error('Erro ao atualizar favorito:', err);
    }
  };

  const abrirConfirmacaoExclusao = (e: React.MouseEvent, planoId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setPlanoParaExcluir(planoId);
  };

  const confirmarExclusao = async () => {
    if (!planoParaExcluir) return;

    setExcluindo(true);
    try {
      const { error } = await supabase
        .from('planos_acao')
        .delete()
        .eq('id', planoParaExcluir);

      if (error) {
        console.error('Erro Supabase ao deletar:', error);
        setErro('Erro ao excluir plano: ' + error.message);
        return;
      }
      
      // Atualizar lista
      setPlanosSalvos(prev => prev.filter(p => p.id !== planoParaExcluir));
      
      if (planoVisualizando?.id === planoParaExcluir) {
        setPlanoVisualizando(null);
      }
    } catch (err) {
      console.error('Erro ao deletar plano:', err);
      setErro('Erro ao excluir plano');
    } finally {
      setExcluindo(false);
      setPlanoParaExcluir(null);
    }
  };

  const visualizarPlano = (planoSalvo: PlanoSalvo) => {
    setPlanoVisualizando(planoSalvo);
    setShowPlanosSalvos(false);
  };

  const gerarPlano = async () => {
    setLoading(true);
    setErro(null);

    try {
      const dados = {
        // Situação Atual
        alunosAtual: inputs.alunosAtual,
        ticketMedio: inputs.ticketMedio,
        mrrAtual: inputs.alunosAtual * inputs.ticketMedio,
        
        // Metas
        alunosObjetivo: inputs.alunosObjetivo,
        mrrObjetivo: inputs.mrrObjetivo,
        
        // Parâmetros
        churnProjetado: inputs.churnProjetado,
        taxaLeadExp: inputs.taxaLeadExp,
        taxaExpMat: inputs.taxaExpMat,
        
        // Cálculos
        matriculasNecessarias: resultado?.matriculasTotais || 0,
        leadsNecessarios: resultado?.leadsMensais ? resultado.leadsMensais * resultado.mesesRestantes : 0,
        evasoesProjetadas: resultado?.evasoesTotais || 0,
        
        // Histórico
        historico: historico || [],
        
        // Alertas
        alertas: alertas.map(a => ({ tipo: a.tipo, mensagem: a.mensagem })),
        
        // Contexto
        unidadeId: unidadeId || '',
        unidadeNome: unidadeNome || 'Unidade',
        mesAtual: new Date().getMonth() + 1,
        anoAtual: new Date().getFullYear(),
      };

      const { data, error } = await supabase.functions.invoke('gemini-insights', {
        body: dados,
      });

      if (error) {
        throw new Error(error.message || 'Erro ao chamar Edge Function');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setPlano(data);
    } catch (err) {
      console.error('Erro ao gerar plano:', err);
      setErro(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-xl">
            <Brain className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              Plano de Ação Inteligente
              <Sparkles className="w-4 h-4 text-amber-400" />
            </h3>
            <p className="text-sm text-slate-400">Análise estratégica personalizada com IA</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão Ver Planos Salvos */}
          {planosSalvos.length > 0 && (
            <button
              onClick={() => setShowPlanosSalvos(!showPlanosSalvos)}
              className="px-3 py-2 rounded-xl font-medium text-sm flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Salvos</span>
              <span className="bg-violet-500/30 text-violet-300 text-xs px-1.5 py-0.5 rounded-full">
                {planosSalvos.length}
              </span>
            </button>
          )}

          {/* Botão Salvar Plano */}
          {plano && !loading && (
            <button
              onClick={() => setShowSaveModal(true)}
              className="px-3 py-2 rounded-xl font-medium text-sm flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white transition-all"
            >
              <Save className="w-4 h-4" />
              <span className="hidden sm:inline">Salvar</span>
            </button>
          )}

          {/* Botão Gerar Plano */}
          <button
            onClick={gerarPlano}
            disabled={loading}
            className={cn(
              "px-4 py-2 rounded-xl font-medium text-sm flex items-center gap-2 transition-all",
              loading
                ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                : "bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-violet-500/25"
            )}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {plano ? 'Novo Plano' : 'Gerar Plano'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mensagem de sucesso ao salvar */}
      {salvoComSucesso && (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-emerald-400">
          <Check className="w-4 h-4" />
          <span className="text-sm font-medium">Plano salvo com sucesso!</span>
        </div>
      )}

      {/* Erro */}
      {erro && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400 font-medium">Erro ao gerar plano</p>
            <p className="text-sm text-red-300/70 mt-1">{erro}</p>
          </div>
        </div>
      )}

      {/* Estado inicial */}
      {!plano && !loading && !erro && (
        <div className="text-center py-8 text-slate-400">
          <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Clique em "Gerar Plano" para receber sugestões personalizadas</p>
          <p className="text-xs text-slate-500 mt-1">Baseado nos seus dados e metas definidas</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <div className="relative inline-block">
            <Brain className="w-16 h-16 text-violet-400 animate-pulse" />
            <Sparkles className="w-6 h-6 text-amber-400 absolute -top-1 -right-1 animate-bounce" />
          </div>
          <p className="text-slate-300 mt-4 font-medium">Analisando seus dados...</p>
          <p className="text-sm text-slate-500 mt-1">Gerando plano de ação personalizado</p>
        </div>
      )}

      {/* Plano Gerado */}
      {plano && !loading && (
        <div className="space-y-6">
          {/* Diagnóstico */}
          <div className="bg-gradient-to-br from-slate-700/50 to-slate-800/50 border border-slate-600/50 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                <Lightbulb className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <h4 className="font-semibold text-white text-sm mb-1">Diagnóstico</h4>
                <p className="text-sm text-slate-300 leading-relaxed">{plano.diagnostico}</p>
              </div>
            </div>
          </div>

          {/* Ações por Prazo */}
          <SecaoAcoes
            titulo="Curto Prazo (Próximas 2 semanas)"
            icone={Clock}
            acoes={plano.acoes_curto_prazo}
            corIcone="bg-emerald-500/20 text-emerald-400"
          />

          <SecaoAcoes
            titulo="Médio Prazo (Próximo mês)"
            icone={Calendar}
            acoes={plano.acoes_medio_prazo}
            corIcone="bg-amber-500/20 text-amber-400"
          />

          <SecaoAcoes
            titulo="Longo Prazo (Próximo trimestre)"
            icone={Target}
            acoes={plano.acoes_longo_prazo}
            corIcone="bg-violet-500/20 text-violet-400"
          />

          {/* Insights Adicionais */}
          {plano.insights_adicionais && plano.insights_adicionais.length > 0 && (
            <div className="bg-slate-700/30 border border-slate-600/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <h4 className="font-semibold text-white text-sm">Insights Adicionais</h4>
              </div>
              <ul className="space-y-2">
                {plano.insights_adicionais.map((insight, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-amber-400 mt-1">•</span>
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Legenda */}
          <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-700/50 text-xs text-slate-500">
            <span className="font-medium">Responsáveis:</span>
            <span className={cn("px-2 py-1 rounded-full", responsavelColors.Gestor)}>Gestor</span>
            <span className={cn("px-2 py-1 rounded-full", responsavelColors.Farmer)}>Farmer (ADM)</span>
            <span className={cn("px-2 py-1 rounded-full", responsavelColors.Hunter)}>Hunter (Comercial)</span>
          </div>
        </div>
      )}

      {/* Lista de Planos Salvos */}
      {showPlanosSalvos && (
        <div className="mt-4 bg-slate-700/30 border border-slate-600/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-white text-sm flex items-center gap-2">
              <History className="w-4 h-4 text-violet-400" />
              Planos Salvos
            </h4>
            <button
              onClick={() => setShowPlanosSalvos(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {loadingPlanos ? (
            <div className="text-center py-4 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            </div>
          ) : planosSalvos.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Nenhum plano salvo ainda</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {planosSalvos.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white text-sm truncate">{p.nome}</span>
                      {p.favorito && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                    </div>
                    <p className="text-xs text-slate-400">
                      {p.mes}/{p.ano} • {new Date(p.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => visualizarPlano(p)}
                      className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-cyan-400 transition-colors"
                      title="Visualizar"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => toggleFavorito(e, p.id, p.favorito)}
                      className={cn(
                        "p-1.5 rounded-lg hover:bg-slate-700 transition-colors",
                        p.favorito ? "text-amber-400" : "text-slate-400 hover:text-amber-400"
                      )}
                      title={p.favorito ? "Remover favorito" : "Favoritar"}
                    >
                      <Star className={cn("w-4 h-4", p.favorito && "fill-amber-400")} />
                    </button>
                    <button
                      onClick={(e) => abrirConfirmacaoExclusao(e, p.id)}
                      className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Visualização de Plano Salvo */}
      {planoVisualizando && (
        <div className="mt-4 bg-gradient-to-br from-violet-900/20 to-fuchsia-900/20 border border-violet-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-semibold text-white flex items-center gap-2">
                {planoVisualizando.nome}
                {planoVisualizando.favorito && <Star className="w-4 h-4 text-amber-400 fill-amber-400" />}
              </h4>
              <p className="text-xs text-slate-400">
                Salvo em {new Date(planoVisualizando.created_at).toLocaleDateString('pt-BR')} • {planoVisualizando.mes}/{planoVisualizando.ano}
              </p>
            </div>
            <button
              onClick={() => setPlanoVisualizando(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Diagnóstico do plano salvo */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-4 h-4 text-cyan-400 mt-0.5" />
              <p className="text-sm text-slate-300">{planoVisualizando.diagnostico}</p>
            </div>
          </div>

          {/* Ações do plano salvo */}
          <SecaoAcoes
            titulo="Curto Prazo"
            icone={Clock}
            acoes={planoVisualizando.acoes_curto_prazo}
            corIcone="bg-emerald-500/20 text-emerald-400"
          />
          <div className="mt-4">
            <SecaoAcoes
              titulo="Médio Prazo"
              icone={Calendar}
              acoes={planoVisualizando.acoes_medio_prazo}
              corIcone="bg-amber-500/20 text-amber-400"
            />
          </div>
          <div className="mt-4">
            <SecaoAcoes
              titulo="Longo Prazo"
              icone={Target}
              acoes={planoVisualizando.acoes_longo_prazo}
              corIcone="bg-violet-500/20 text-violet-400"
            />
          </div>
        </div>
      )}

      {/* Modal Salvar Plano */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Save className="w-5 h-5 text-emerald-400" />
                Salvar Plano
              </h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Nome do Plano *
                </label>
                <input
                  type="text"
                  value={nomePlano}
                  onChange={(e) => setNomePlano(e.target.value)}
                  placeholder="Ex: Plano de Recuperação Janeiro"
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Descrição (opcional)
                </label>
                <textarea
                  value={descricaoPlano}
                  onChange={(e) => setDescricaoPlano(e.target.value)}
                  placeholder="Observações sobre este plano..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={salvarPlano}
                  disabled={!nomePlano.trim() || salvando}
                  className={cn(
                    "flex-1 px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors",
                    !nomePlano.trim() || salvando
                      ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white"
                  )}
                >
                  {salvando ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Salvar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AlertDialog de Confirmação de Exclusão */}
      <AlertDialog open={!!planoParaExcluir} onOpenChange={(open) => !open && setPlanoParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Plano</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este plano? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao} disabled={excluindo}>
              {excluindo ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
