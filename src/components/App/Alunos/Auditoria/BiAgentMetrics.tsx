import { useState, useEffect } from 'react';
import { BarChart3, MessageSquare, DollarSign, ThumbsUp, ThumbsDown, Cpu, Users, Loader2, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Metrics {
  total_conversas: number;
  total_mensagens: number;
  msgs_usuario: number;
  msgs_assistente: number;
  total_tokens: number;
  custo_total_usd: number;
  likes: number;
  dislikes: number;
  msgs_com_tools: number;
  usuarios_distintos: number;
  media_tokens_por_msg: number;
  custo_medio_por_conversa: number;
}

interface DailyUsage {
  dia: string;
  mensagens: number;
  custo: number;
}

export function BiAgentMetrics() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [daily, setDaily] = useState<DailyUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      setLoading(true);

      const [metricsResult, dailyResult] = await Promise.all([
        supabase.rpc('execute_bi_query_lamusic', {
          query_text: `SELECT
            COUNT(DISTINCT c.id) as total_conversas,
            COUNT(m.id) as total_mensagens,
            COUNT(m.id) FILTER (WHERE m.role = 'user') as msgs_usuario,
            COUNT(m.id) FILTER (WHERE m.role = 'assistant') as msgs_assistente,
            COALESCE(SUM(m.prompt_tokens + m.completion_tokens), 0) as total_tokens,
            ROUND(COALESCE(SUM(m.cost_usd), 0)::numeric, 4) as custo_total_usd,
            COUNT(m.id) FILTER (WHERE m.feedback_rating = 5) as likes,
            COUNT(m.id) FILTER (WHERE m.feedback_rating = 1) as dislikes,
            COUNT(m.id) FILTER (WHERE m.tool_calls IS NOT NULL) as msgs_com_tools,
            COUNT(DISTINCT c.user_id) as usuarios_distintos,
            CASE WHEN COUNT(m.id) FILTER (WHERE m.role = 'assistant') > 0
              THEN ROUND(COALESCE(SUM(m.prompt_tokens + m.completion_tokens), 0)::numeric / COUNT(m.id) FILTER (WHERE m.role = 'assistant'))
              ELSE 0 END as media_tokens_por_msg,
            CASE WHEN COUNT(DISTINCT c.id) > 0
              THEN ROUND(COALESCE(SUM(m.cost_usd), 0)::numeric / COUNT(DISTINCT c.id), 4)
              ELSE 0 END as custo_medio_por_conversa
          FROM bi_conversations_lamusic c
          LEFT JOIN bi_messages_lamusic m ON m.conversation_id = c.id`,
          p_unidade_id: null,
          max_rows: 1,
        }),
        supabase.rpc('execute_bi_query_lamusic', {
          query_text: `SELECT
            to_char(m.created_at, 'DD/MM') as dia,
            COUNT(*) as mensagens,
            ROUND(COALESCE(SUM(m.cost_usd), 0)::numeric, 4) as custo
          FROM bi_messages_lamusic m
          WHERE m.created_at >= now() - interval '7 days' AND m.role = 'assistant'
          GROUP BY to_char(m.created_at, 'DD/MM'), m.created_at::date
          ORDER BY m.created_at::date`,
          p_unidade_id: null,
          max_rows: 7,
        }),
      ]);

      if (metricsResult.data && Array.isArray(metricsResult.data) && metricsResult.data[0]) {
        setMetrics(metricsResult.data[0] as Metrics);
      }
      if (dailyResult.data && Array.isArray(dailyResult.data)) {
        setDaily(dailyResult.data as DailyUsage[]);
      }

      setLoading(false);
    }

    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-violet-400 mr-2" />
        <span className="text-sm text-slate-400">Carregando métricas...</span>
      </div>
    );
  }

  if (!metrics) return null;

  const satisfacao = metrics.likes + metrics.dislikes > 0
    ? Math.round((metrics.likes / (metrics.likes + metrics.dislikes)) * 100)
    : null;

  const cards = [
    { label: 'Conversas', value: metrics.total_conversas, icon: MessageSquare, color: 'text-violet-400', bg: 'bg-violet-500/10' },
    { label: 'Mensagens', value: metrics.total_mensagens, icon: BarChart3, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { label: 'Usuários', value: metrics.usuarios_distintos, icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Tool calls', value: metrics.msgs_com_tools, icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  ];

  const maxMessages = Math.max(...daily.map(d => d.mensagens), 1);

  return (
    <div className="space-y-4 mt-6">
      <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
        <Cpu className="w-4 h-4 text-violet-400" />
        Métricas do Agente BI
      </h4>

      {/* Cards principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((card, i) => (
          <div key={i} className={`${card.bg} border border-slate-700/50 rounded-xl p-3`}>
            <div className="flex items-center gap-2 mb-1">
              <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
              <span className="text-[11px] text-slate-500">{card.label}</span>
            </div>
            <p className={`text-xl font-bold ${card.color}`}>{card.value.toLocaleString('pt-BR')}</p>
          </div>
        ))}
      </div>

      {/* Segunda linha: Custos + Feedback + Gráfico diário */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-medium text-slate-300">Custos</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] text-slate-500">Total gasto</span>
              <span className="text-sm font-bold text-emerald-400">${metrics.custo_total_usd}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] text-slate-500">Custo/conversa</span>
              <span className="text-sm font-mono text-slate-300">${metrics.custo_medio_por_conversa}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] text-slate-500">Total tokens</span>
              <span className="text-sm font-mono text-slate-300">{metrics.total_tokens.toLocaleString('pt-BR')}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] text-slate-500">Tokens/resposta</span>
              <span className="text-sm font-mono text-slate-300">{metrics.media_tokens_por_msg.toLocaleString('pt-BR')}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <ThumbsUp className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-medium text-slate-300">Feedback</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] text-slate-500">Satisfação</span>
              <span className={`text-sm font-bold ${satisfacao === null ? 'text-slate-500' : satisfacao >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {satisfacao !== null ? `${satisfacao}%` : 'Sem dados'}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-sm font-mono text-slate-300">{metrics.likes}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ThumbsDown className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-sm font-mono text-slate-300">{metrics.dislikes}</span>
              </div>
            </div>
            {satisfacao !== null && (
              <div className="w-full bg-slate-700/50 rounded-full h-1.5 mt-2">
                <div
                  className={`h-1.5 rounded-full ${satisfacao >= 70 ? 'bg-emerald-400' : 'bg-amber-400'}`}
                  style={{ width: `${satisfacao}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Gráfico diário */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
          <span className="text-xs font-medium text-slate-300 mb-3 block">Últimos 7 dias</span>
          {daily.length > 0 ? (
            <div className="flex items-end gap-1.5 h-[90px]">
              {daily.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px] text-slate-500 font-mono">{d.mensagens}</span>
                  <div
                    className="w-full bg-violet-500/60 rounded-t"
                    style={{ height: `${Math.max((d.mensagens / maxMessages) * 70, 4)}px` }}
                  />
                  <span className="text-[9px] text-slate-600">{d.dia}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-600 text-center py-6">Sem atividade recente</p>
          )}
        </div>
      </div>
    </div>
  );
}
