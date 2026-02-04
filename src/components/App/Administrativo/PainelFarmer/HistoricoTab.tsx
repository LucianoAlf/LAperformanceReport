'use client';

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  CheckCircle2, 
  ListTodo,
  Calendar,
  TrendingUp
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useColaboradorAtual } from './hooks';
import type { HistoricoRotinas } from './types';

interface HistoricoTabProps {
  unidadeId: string;
}

export function HistoricoTab({ unidadeId }: HistoricoTabProps) {
  const { colaborador } = useColaboradorAtual();
  const [historico, setHistorico] = useState<HistoricoRotinas[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<7 | 14 | 30>(7);

  useEffect(() => {
    async function fetchHistorico() {
      if (!colaborador?.id) return;

      setLoading(true);
      try {
        const { data, error } = await supabase
          .rpc('get_historico_rotinas', {
            p_colaborador_id: colaborador.id,
            p_dias: periodo
          });

        if (error) throw error;
        setHistorico(data || []);
      } catch (err) {
        console.error('Erro ao buscar histórico:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchHistorico();
  }, [colaborador?.id, periodo]);

  // Calcular estatísticas
  const totalRotinas = historico.reduce((acc, h) => acc + h.total_rotinas, 0);
  const totalConcluidas = historico.reduce((acc, h) => acc + h.rotinas_concluidas, 0);
  const totalTarefas = historico.reduce((acc, h) => acc + h.tarefas_concluidas, 0);
  const mediaPercentual = historico.length > 0 
    ? Math.round(historico.reduce((acc, h) => acc + h.percentual, 0) / historico.length)
    : 0;

  // Formatar data
  const formatarData = (dataStr: string) => {
    const data = new Date(dataStr + 'T00:00:00');
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);

    if (data.toDateString() === hoje.toDateString()) return 'Hoje';
    if (data.toDateString() === ontem.toDateString()) return 'Ontem';

    return data.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-slate-800/50 rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-slate-700 rounded w-1/2 mb-2"></div>
              <div className="h-8 bg-slate-700 rounded w-3/4"></div>
            </div>
          ))}
        </div>
        <div className="bg-slate-800/50 rounded-xl p-6 animate-pulse">
          <div className="h-6 bg-slate-700 rounded w-1/4 mb-6"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} className="h-12 bg-slate-700/50 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Histórico de Desempenho</h3>
          <p className="text-sm text-slate-400">Acompanhe sua evolução nas rotinas e tarefas</p>
        </div>
        <div className="flex gap-2">
          {[7, 14, 30].map(dias => (
            <button
              key={dias}
              onClick={() => setPeriodo(dias as 7 | 14 | 30)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                periodo === dias
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-700/50 text-slate-400 hover:text-white'
              )}
            >
              {dias} dias
            </button>
          ))}
        </div>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="Rotinas Concluídas"
          value={`${totalConcluidas}/${totalRotinas}`}
          color="emerald"
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Média de Completude"
          value={`${mediaPercentual}%`}
          color="violet"
        />
        <StatCard
          icon={<ListTodo className="w-5 h-5" />}
          label="Tarefas Concluídas"
          value={String(totalTarefas)}
          color="blue"
        />
        <StatCard
          icon={<Calendar className="w-5 h-5" />}
          label="Dias Analisados"
          value={String(periodo)}
          color="amber"
        />
      </div>

      {/* Tabela de Histórico */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/50">
          <h4 className="font-semibold text-white">📊 Histórico Diário</h4>
        </div>

        {historico.length === 0 ? (
          <div className="p-12 text-center">
            <BarChart3 className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <h4 className="text-lg font-medium text-white mb-2">Sem dados de histórico</h4>
            <p className="text-slate-400">Complete rotinas para ver seu histórico aqui</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {historico.map((item, index) => (
              <div 
                key={item.data}
                className="px-5 py-4 flex items-center justify-between hover:bg-slate-700/20 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-white w-24">
                    {formatarData(item.data)}
                  </span>
                  
                  {/* Barra de progresso */}
                  <div className="w-48 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all",
                        item.percentual >= 100 ? "bg-emerald-500" :
                        item.percentual >= 70 ? "bg-violet-500" :
                        item.percentual >= 50 ? "bg-amber-500" : "bg-rose-500"
                      )}
                      style={{ width: `${item.percentual}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm font-medium text-white">
                      {item.rotinas_concluidas}/{item.total_rotinas} rotinas
                    </p>
                    <p className="text-xs text-slate-400">
                      {item.percentual}% concluído
                    </p>
                  </div>

                  {item.tarefas_concluidas > 0 && (
                    <div className="text-right">
                      <p className="text-sm font-medium text-blue-400">
                        +{item.tarefas_concluidas}
                      </p>
                      <p className="text-xs text-slate-400">tarefas</p>
                    </div>
                  )}

                  {/* Badge de status */}
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center",
                    item.percentual >= 100 ? "bg-emerald-500/20" :
                    item.percentual >= 70 ? "bg-violet-500/20" :
                    item.percentual >= 50 ? "bg-amber-500/20" : "bg-rose-500/20"
                  )}>
                    {item.percentual >= 100 ? '🏆' :
                     item.percentual >= 70 ? '👍' :
                     item.percentual >= 50 ? '⚠️' : '😔'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Componente: Card de Estatística
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: 'emerald' | 'violet' | 'blue' | 'amber';
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  const colorStyles = {
    emerald: 'from-emerald-500/10 to-teal-500/10 border-emerald-500/20 text-emerald-400',
    violet: 'from-violet-500/10 to-purple-500/10 border-violet-500/20 text-violet-400',
    blue: 'from-blue-500/10 to-cyan-500/10 border-blue-500/20 text-blue-400',
    amber: 'from-amber-500/10 to-orange-500/10 border-amber-500/20 text-amber-400',
  };

  return (
    <div className={cn(
      'bg-gradient-to-br rounded-xl border p-4',
      colorStyles[color]
    )}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

export default HistoricoTab;
