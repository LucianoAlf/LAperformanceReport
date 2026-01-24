import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Sparkles, Loader2, AlertTriangle, CheckCircle2, Users, Target,
  TrendingUp, Calendar, Award, BookOpen, MessageSquare, Brain
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProfessorMetricas {
  id: number;
  nome: string;
  total_alunos: number;
  total_turmas: number;
  media_alunos_turma: number;
  taxa_retencao: number;
  taxa_conversao: number;
  nps: number | null;
  taxa_presenca: number;
  evasoes_mes: number;
  status: 'critico' | 'atencao' | 'excelente';
  unidades: string[];
}

interface MetricasGerais {
  total_professores: number;
  total_alunos: number;
  media_geral_turma: number;
  taxa_retencao_media: number;
  taxa_conversao_media: number;
  nps_medio: number;
  total_evasoes: number;
  professores_criticos: number;
  professores_atencao: number;
  professores_excelentes: number;
}

interface InsightsEquipe {
  resumo_executivo: string;
  saude_equipe: 'critica' | 'atencao' | 'saudavel' | 'excelente';
  principais_desafios: Array<{
    area: string;
    descricao: string;
    impacto: 'alto' | 'medio' | 'baixo';
    professores_afetados: string[];
  }>;
  professores_destaque: {
    criticos: Array<{
      nome: string;
      problema_principal: string;
      acao_urgente: string;
    }>;
    exemplares: Array<{
      nome: string;
      ponto_forte: string;
      pode_mentorar: string;
    }>;
  };
  plano_acao_coletivo: Array<{
    prioridade: number;
    tipo: 'treinamento' | 'mentoria' | 'processo' | 'acompanhamento';
    titulo: string;
    descricao: string;
    professores_alvo: string[] | 'todos';
    prazo_sugerido: string;
    resultado_esperado: string;
  }>;
  metricas_foco: Array<{
    metrica: string;
    valor_atual: string;
    meta_sugerida: string;
    prazo: string;
  }>;
  mensagem_coordenacao: string;
}

interface Props {
  professores: ProfessorMetricas[];
  metricas_gerais: MetricasGerais;
  competencia: string;
  unidade_nome?: string;
}

export function PlanoAcaoEquipe({ professores, metricas_gerais, competencia, unidade_nome }: Props) {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<InsightsEquipe | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gerarPlano = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-insights-equipe`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            professores,
            metricas_gerais,
            competencia,
            unidade_nome
          })
        }
      );

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Erro ao gerar plano');
      }

      setInsights(data.insights);
    } catch (err) {
      console.error('Erro ao gerar plano:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const getSaudeColor = (saude: string) => {
    switch (saude) {
      case 'critica': return 'text-red-400 bg-red-500/20';
      case 'atencao': return 'text-yellow-400 bg-yellow-500/20';
      case 'saudavel': return 'text-blue-400 bg-blue-500/20';
      case 'excelente': return 'text-green-400 bg-green-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  };

  const getSaudeLabel = (saude: string) => {
    switch (saude) {
      case 'critica': return '🔴 Crítica';
      case 'atencao': return '🟡 Atenção';
      case 'saudavel': return '🟢 Saudável';
      case 'excelente': return '✨ Excelente';
      default: return saude;
    }
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'treinamento': return <BookOpen className="w-4 h-4" />;
      case 'mentoria': return <Users className="w-4 h-4" />;
      case 'processo': return <Target className="w-4 h-4" />;
      case 'acompanhamento': return <Calendar className="w-4 h-4" />;
      default: return <CheckCircle2 className="w-4 h-4" />;
    }
  };

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'treinamento': return 'bg-blue-500';
      case 'mentoria': return 'bg-purple-500';
      case 'processo': return 'bg-amber-500';
      case 'acompanhamento': return 'bg-cyan-500';
      default: return 'bg-slate-500';
    }
  };

  const getImpactoColor = (impacto: string) => {
    switch (impacto) {
      case 'alto': return 'text-red-400';
      case 'medio': return 'text-yellow-400';
      case 'baixo': return 'text-green-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="bg-slate-900/50 rounded-2xl border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white flex items-center gap-2">
              Plano de Ação Inteligente <Sparkles className="w-4 h-4 text-yellow-400" />
            </h3>
            <p className="text-sm text-slate-400">Análise geral e sugestões estratégicas para a coordenação</p>
          </div>
        </div>
        {!insights && !loading && (
          <Button
            onClick={gerarPlano}
            className="bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:opacity-90 px-6"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Gerar Plano
          </Button>
        )}
      </div>

      {/* Conteúdo */}
      <div className="p-6">
        {/* Estado inicial - sem insights */}
        {!insights && !loading && !error && (
          <div className="text-center py-12">
            <div className="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
              <Brain className="w-10 h-10 text-purple-400" />
            </div>
            <p className="text-slate-400 mb-2">
              Clique em "Gerar Plano" para receber sugestões personalizadas
            </p>
            <p className="text-slate-500 text-sm">
              Baseado nos seus dados e metas definidas
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
            <p className="text-slate-400">Analisando dados de {metricas_gerais.total_professores} professores...</p>
            <p className="text-slate-500 text-sm mt-1">Isso pode levar alguns segundos</p>
          </div>
        )}

        {/* Erro */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-400">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-red-400"
              onClick={gerarPlano}
            >
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Insights */}
        {insights && (
          <div className="space-y-6">
            {/* Resumo Executivo */}
            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <h4 className="text-white font-medium flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  Resumo Executivo
                </h4>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getSaudeColor(insights.saude_equipe)}`}>
                  {getSaudeLabel(insights.saude_equipe)}
                </span>
              </div>
              <p className="text-slate-300 text-sm">{insights.resumo_executivo}</p>
            </div>

            {/* Principais Desafios */}
            {insights.principais_desafios.length > 0 && (
              <div>
                <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  Principais Desafios
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {insights.principais_desafios.map((desafio, idx) => (
                    <div key={idx} className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white font-medium text-sm">{desafio.area}</span>
                        <span className={`text-xs ${getImpactoColor(desafio.impacto)}`}>
                          Impacto {desafio.impacto}
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs mb-2">{desafio.descricao}</p>
                      {Array.isArray(desafio.professores_afetados) && desafio.professores_afetados.length > 0 && (
                        <p className="text-slate-500 text-xs">
                          Afeta: {desafio.professores_afetados.slice(0, 3).join(', ')}
                          {desafio.professores_afetados.length > 3 && ` +${desafio.professores_afetados.length - 3}`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Professores em Destaque */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Críticos */}
              {insights.professores_destaque.criticos.length > 0 && (
                <div>
                  <h4 className="text-red-400 font-medium mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Precisam de Atenção Urgente
                  </h4>
                  <div className="space-y-2">
                    {insights.professores_destaque.criticos.map((prof, idx) => (
                      <div key={idx} className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                        <p className="text-white font-medium text-sm">{prof.nome}</p>
                        <p className="text-red-400 text-xs">{prof.problema_principal}</p>
                        <p className="text-slate-400 text-xs mt-1">→ {prof.acao_urgente}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Exemplares */}
              {insights.professores_destaque.exemplares.length > 0 && (
                <div>
                  <h4 className="text-green-400 font-medium mb-3 flex items-center gap-2">
                    <Award className="w-4 h-4" />
                    Professores Exemplares
                  </h4>
                  <div className="space-y-2">
                    {insights.professores_destaque.exemplares.map((prof, idx) => (
                      <div key={idx} className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                        <p className="text-white font-medium text-sm">{prof.nome}</p>
                        <p className="text-green-400 text-xs">{prof.ponto_forte}</p>
                        <p className="text-slate-400 text-xs mt-1">Pode mentorar: {prof.pode_mentorar}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Plano de Ação Coletivo */}
            {insights.plano_acao_coletivo.length > 0 && (
              <div>
                <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-400" />
                  Plano de Ação Coletivo
                </h4>
                <div className="space-y-3">
                  {insights.plano_acao_coletivo.map((acao, idx) => (
                    <div key={idx} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg ${getTipoColor(acao.tipo)} flex items-center justify-center text-white flex-shrink-0`}>
                          {getTipoIcon(acao.tipo)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-white font-medium">{acao.titulo}</p>
                            <span className="text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded">
                              Prioridade {acao.prioridade}
                            </span>
                          </div>
                          <p className="text-slate-400 text-sm mb-2">{acao.descricao}</p>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="text-slate-500">
                              👥 {Array.isArray(acao.professores_alvo) ? acao.professores_alvo.join(', ') : 'Todos os professores'}
                            </span>
                            <span className="text-slate-500">📅 {acao.prazo_sugerido}</span>
                          </div>
                          <p className="text-green-400 text-xs mt-2">→ {acao.resultado_esperado}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Métricas Foco */}
            {insights.metricas_foco.length > 0 && (
              <div>
                <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                  Métricas para Focar
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {insights.metricas_foco.map((metrica, idx) => (
                    <div key={idx} className="bg-slate-800/50 rounded-xl p-3 text-center border border-slate-700/50">
                      <p className="text-slate-400 text-xs mb-1">{metrica.metrica}</p>
                      <p className="text-white font-bold">{metrica.valor_atual}</p>
                      <p className="text-green-400 text-xs">Meta: {metrica.meta_sugerida}</p>
                      <p className="text-slate-500 text-xs">{metrica.prazo}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mensagem para Coordenação */}
            <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/30 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-white font-medium mb-1">Mensagem para a Coordenação</h4>
                  <p className="text-slate-300 text-sm italic">"{insights.mensagem_coordenacao}"</p>
                </div>
              </div>
            </div>

            {/* Botão para regenerar */}
            <div className="flex justify-center pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-400"
                onClick={gerarPlano}
                disabled={loading}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Gerar novo plano
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
