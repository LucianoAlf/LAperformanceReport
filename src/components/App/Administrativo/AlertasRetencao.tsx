'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Bell, CheckCircle, TrendingDown, TrendingUp, RefreshCw, Users, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

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

interface RenovacoesProximas {
  unidade_id: string;
  unidade_nome: string;
  total_ativos: number;
  sem_data_contrato: number;
  vencidos: number;
  urgente_7_dias: number;
  atencao_15_dias: number;
  proximo_30_dias: number;
}

interface Alerta {
  id: string;
  tipo: 'critico' | 'atencao' | 'sucesso' | 'info';
  titulo: string;
  descricao: string;
  icone: React.ReactNode;
}

interface AlertasRetencaoProps {
  unidadeId: string;
  ano: number;
  mes: number;
  // Dados reais calculados pelo AdministrativoPage (fonte: movimentacoes_admin)
  churnRate?: number;        // % churn real do período
  taxaRenovacao?: number;    // % taxa de renovação real do período
  inadimplenciaPct?: number; // % inadimplência real do período
  totalRenovacoes?: number;
  totalVencimentos?: number;
  totalEvasoes?: number;
  alunosAtivos?: number;
}

export function AlertasRetencao({ 
  unidadeId, ano, mes,
  churnRate, taxaRenovacao, inadimplenciaPct,
  totalRenovacoes, totalVencimentos, totalEvasoes, alunosAtivos
}: AlertasRetencaoProps) {
  const [alertasRenovacoes, setAlertasRenovacoes] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertasFechados, setAlertasFechados] = useState<Set<string>>(new Set());

  // Buscar apenas renovações próximas (dados independentes do período)
  useEffect(() => {
    carregarRenovacoesProximas();
  }, [unidadeId]);

  async function carregarRenovacoesProximas() {
    setLoading(true);
    try {
      const alertasGerados: Alerta[] = [];

      const unidadeUUID = getUnidadeUUID(unidadeId);
      const { data: renovacoes, error: errorRenovacoes } = await supabase
        .rpc('get_resumo_renovacoes_proximas', {
          p_unidade_id: unidadeUUID
        });

      if (!errorRenovacoes && renovacoes) {
        const totalVencidos = renovacoes.reduce((acc: number, r: RenovacoesProximas) => acc + (r.vencidos || 0), 0);
        const totalUrgente = renovacoes.reduce((acc: number, r: RenovacoesProximas) => acc + (r.urgente_7_dias || 0), 0);
        const totalAtencao = renovacoes.reduce((acc: number, r: RenovacoesProximas) => acc + (r.atencao_15_dias || 0), 0);

        if (totalVencidos > 0) {
          alertasGerados.push({
            id: 'renovacoes-vencidas',
            tipo: 'critico',
            titulo: `${totalVencidos} renovação(ões) vencida(s)!`,
            descricao: 'Alunos com contrato vencido precisam de atenção imediata',
            icone: <AlertTriangle className="w-5 h-5" />
          });
        }

        if (totalUrgente > 0) {
          alertasGerados.push({
            id: 'renovacoes-urgentes',
            tipo: 'atencao',
            titulo: `${totalUrgente} renovação(ões) nos próximos 7 dias`,
            descricao: 'Antecipe o contato para garantir a renovação',
            icone: <Bell className="w-5 h-5" />
          });
        }

        if (totalAtencao > 0) {
          alertasGerados.push({
            id: 'renovacoes-atencao',
            tipo: 'info',
            titulo: `${totalAtencao} renovação(ões) nos próximos 15 dias`,
            descricao: 'Planeje o contato com antecedência',
            icone: <Users className="w-5 h-5" />
          });
        }
      }

      setAlertasRenovacoes(alertasGerados);
    } catch (error) {
      console.error('Erro ao carregar alertas de renovações:', error);
    } finally {
      setLoading(false);
    }
  }

  // Gerar alertas de KPIs a partir dos dados reais recebidos via props
  // (fonte: movimentacoes_admin, calculados pelo AdministrativoPage)
  const alertasKPIs: Alerta[] = [];

  // Churn Rate (fonte real: evasões + não renovações / alunos ativos)
  if (churnRate !== undefined) {
    if (churnRate <= 4) {
      alertasKPIs.push({
        id: 'churn-premiado',
        tipo: 'sucesso',
        titulo: '🏆 Churn Premiado! +25 pts Fideliza+',
        descricao: `Churn de ${churnRate.toFixed(1)}% está dentro da meta de 4%`,
        icone: <CheckCircle className="w-5 h-5" />
      });
    } else if (churnRate > 5) {
      alertasKPIs.push({
        id: 'churn-alto',
        tipo: 'critico',
        titulo: `Churn de ${churnRate.toFixed(1)}% acima da meta`,
        descricao: `${totalEvasoes || 0} evasões / ${alunosAtivos || 0} alunos. Meta Fideliza+ é ≤ 4%`,
        icone: <TrendingDown className="w-5 h-5" />
      });
    } else {
      alertasKPIs.push({
        id: 'churn-atencao',
        tipo: 'atencao',
        titulo: `Churn de ${churnRate.toFixed(1)}%`,
        descricao: `${totalEvasoes || 0} evasões / ${alunosAtivos || 0} alunos. Meta Fideliza+ é ≤ 4%`,
        icone: <TrendingDown className="w-5 h-5" />
      });
    }
  }

  // Inadimplência (fonte: dados_mensais — mantém pois não há tabela-fonte alternativa)
  if (inadimplenciaPct !== undefined) {
    if (inadimplenciaPct <= 1) {
      alertasKPIs.push({
        id: 'inadimplencia-1pct',
        tipo: 'sucesso',
        titulo: '🎉 Inadimplência 1%! +20 pts Fideliza+',
        descricao: inadimplenciaPct === 0 
          ? 'Parabéns! Nenhuma inadimplência no mês!' 
          : `Inadimplência de ${inadimplenciaPct.toFixed(1)}% está dentro da meta de 1%`,
        icone: <CheckCircle className="w-5 h-5" />
      });
    } else if (inadimplenciaPct > 2) {
      alertasKPIs.push({
        id: 'inadimplencia-alta',
        tipo: 'atencao',
        titulo: `Inadimplência de ${inadimplenciaPct.toFixed(1)}%`,
        descricao: 'Meta Fideliza+ é ≤ 1%. Verificar cobranças pendentes.',
        icone: <AlertTriangle className="w-5 h-5" />
      });
    }
  }

  // Taxa de Renovação (fonte real: renovações / vencimentos do período)
  if (taxaRenovacao !== undefined && totalVencimentos !== undefined && totalVencimentos > 0) {
    if (taxaRenovacao >= 90) {
      alertasKPIs.push({
        id: 'max-renovacao',
        tipo: 'sucesso',
        titulo: '🔥 Max Renovação! +25 pts Fideliza+',
        descricao: taxaRenovacao >= 100 
          ? `100% das renovações realizadas! (${totalRenovacoes} de ${totalVencimentos})` 
          : `Taxa de ${taxaRenovacao.toFixed(0)}% (${totalRenovacoes} de ${totalVencimentos}). Meta: ≥ 90%`,
        icone: <TrendingUp className="w-5 h-5" />
      });
    } else if (taxaRenovacao < 80) {
      alertasKPIs.push({
        id: 'renovacao-baixa',
        tipo: 'atencao',
        titulo: `Taxa de renovação de ${taxaRenovacao.toFixed(0)}%`,
        descricao: `${totalRenovacoes || 0} de ${totalVencimentos} vencimentos. Meta Fideliza+ é ≥ 90%`,
        icone: <TrendingDown className="w-5 h-5" />
      });
    } else {
      alertasKPIs.push({
        id: 'renovacao-info',
        tipo: 'info',
        titulo: `Taxa de renovação de ${taxaRenovacao.toFixed(0)}%`,
        descricao: `${totalRenovacoes || 0} de ${totalVencimentos} vencimentos. Meta Fideliza+ é ≥ 90%`,
        icone: <RefreshCw className="w-5 h-5" />
      });
    }
  }

  // Combinar alertas de renovações próximas + KPIs reais
  const alertas = [...alertasKPIs, ...alertasRenovacoes];

  function fecharAlerta(id: string) {
    setAlertasFechados(prev => new Set([...prev, id]));
  }

  const alertasVisiveis = alertas.filter(a => !alertasFechados.has(a.id));

  if (loading) {
    return (
      <div className="mb-6 animate-pulse">
        <div className="h-16 bg-slate-800/50 rounded-xl" />
      </div>
    );
  }

  if (alertasVisiveis.length === 0) {
    return null;
  }

  const getAlertaStyles = (tipo: Alerta['tipo']) => {
    switch (tipo) {
      case 'critico':
        return 'bg-rose-500/10 border-rose-500/30 text-rose-400';
      case 'atencao':
        return 'bg-amber-500/10 border-amber-500/30 text-amber-400';
      case 'sucesso':
        return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
      case 'info':
      default:
        return 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400';
    }
  };

  return (
    <div className="mb-6 space-y-2">
      {alertasVisiveis.map(alerta => (
        <div
          key={alerta.id}
          className={cn(
            'flex items-center justify-between p-4 rounded-xl border transition-all',
            getAlertaStyles(alerta.tipo)
          )}
        >
          <div className="flex items-center gap-3">
            {alerta.icone}
            <div>
              <p className="font-semibold">{alerta.titulo}</p>
              <p className="text-sm opacity-80">{alerta.descricao}</p>
            </div>
          </div>
          <button
            onClick={() => fecharAlerta(alerta.id)}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
