'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Bell, CheckCircle, TrendingDown, TrendingUp, Target, Users, X, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// Mapeamento de códigos legados para UUIDs
const CODIGO_UUID_MAP: Record<string, string> = {
  'bar': '368d47f5-2d88-4475-bc14-ba084a9a348e',
  'cg': '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  'rec': '95553e96-971b-4590-a6eb-0201d013c14d',
};

const UUID_NOME_MAP: Record<string, string> = {
  '368d47f5-2d88-4475-bc14-ba084a9a348e': 'Barra',
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 'Campo Grande',
  '95553e96-971b-4590-a6eb-0201d013c14d': 'Recreio',
};

function getUnidadeUUID(unidadeId: string | null): string | null {
  if (!unidadeId || unidadeId === 'todos') return null;
  if (unidadeId.includes('-')) return unidadeId;
  return CODIGO_UUID_MAP[unidadeId] || unidadeId;
}

interface Alerta {
  id: string;
  tipo: 'critico' | 'atencao' | 'sucesso' | 'info' | 'fire';
  titulo: string;
  descricao: string;
  icone: React.ReactNode;
}

interface ResumoLeads {
  leads: number;
  experimentais: number;
  visitas: number;
  matriculas: number;
  conversaoLeadExp: number;
  conversaoLeadMat: number;
  conversaoExpMat: number;
}

interface AlertasComercialProps {
  unidadeId: string;
  ano: number;
  mes: number;
  resumoLeads?: ResumoLeads;
}

export function AlertasComercial({ unidadeId, ano, mes, resumoLeads }: AlertasComercialProps) {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertasFechados, setAlertasFechados] = useState<Set<string>>(new Set());

  useEffect(() => {
    carregarAlertas();
  }, [unidadeId, ano, mes, resumoLeads]);

  async function carregarAlertas() {
    setLoading(true);
    try {
      const alertasGerados: Alerta[] = [];
      const unidadeUUID = getUnidadeUUID(unidadeId);

      // 1. KPIs comerciais do mês — usar resumoLeads (tabela leads) se disponível
      // Isso garante que o alerta mostre o mesmo número da tabela de detalhamento
      const totalLeads = resumoLeads?.leads ?? 0;
      const totalMatriculas = resumoLeads?.matriculas ?? 0;
      const taxaConversaoGeral = resumoLeads?.conversaoLeadMat ?? 0;

      // Calcular dias do mês e ritmo
      const hoje = new Date();
      const diasPassados = hoje.getDate();
      const diasNoMes = new Date(ano, mes, 0).getDate();
      const diasRestantes = diasNoMes - diasPassados;
      const ritmoAtual = diasPassados > 0 ? totalMatriculas / diasPassados : 0;

      // Alertas de conquistas
      if (totalMatriculas >= 10) {
        alertasGerados.push({
          id: 'matriculas-destaque',
          tipo: 'fire',
          titulo: `🔥 ${totalMatriculas} matrículas conquistadas!`,
          descricao: 'Excelente trabalho, Hunter! Continue caçando!',
          icone: <Zap className="w-5 h-5" />
        });
      } else if (totalMatriculas >= 5) {
        alertasGerados.push({
          id: 'matriculas-bom',
          tipo: 'sucesso',
          titulo: `🎯 ${totalMatriculas} matrículas no mês!`,
          descricao: 'Bom ritmo! Vamos acelerar para bater a meta!',
          icone: <Target className="w-5 h-5" />
        });
      } else if (totalMatriculas >= 1) {
        alertasGerados.push({
          id: 'matriculas-inicio',
          tipo: 'info',
          titulo: `📋 ${totalMatriculas} matrícula${totalMatriculas > 1 ? 's' : ''} no mês`,
          descricao: 'Vamos acelerar para bater a meta!',
          icone: <Target className="w-5 h-5" />
        });
      }

      // Taxa de conversão
      if (taxaConversaoGeral >= 20) {
        alertasGerados.push({
          id: 'conversao-excelente',
          tipo: 'sucesso',
          titulo: `Taxa de conversão de ${taxaConversaoGeral.toFixed(1)}%!`,
          descricao: 'Conversão acima de 20% é excelente!',
          icone: <TrendingUp className="w-5 h-5" />
        });
      } else if (taxaConversaoGeral < 10 && totalLeads > 0) {
        alertasGerados.push({
          id: 'conversao-baixa',
          tipo: 'atencao',
          titulo: `Taxa de conversão de ${taxaConversaoGeral.toFixed(1)}%`,
          descricao: 'Foco no follow-up e fechamento!',
          icone: <TrendingDown className="w-5 h-5" />
        });
      }

      // Alerta de ritmo
      if (diasRestantes > 0 && diasRestantes <= 7) {
        alertasGerados.push({
          id: 'fim-mes',
          tipo: 'atencao',
          titulo: `⏰ Apenas ${diasRestantes} dias para fechar o mês!`,
          descricao: `Ritmo atual: ${ritmoAtual.toFixed(1)} matrículas/dia`,
          icone: <Bell className="w-5 h-5" />
        });
      }

      // 2. Buscar leads pendentes (filtrado pelo mês selecionado)
      const primeiroDia = `${ano}-${String(mes).padStart(2, '0')}-01`;
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const ultimoDiaStr = `${ano}-${String(mes).padStart(2, '0')}-${ultimoDia}`;

      let leadsQuery = supabase
        .from('leads')
        .select('id, status, data_ultimo_contato')
        .gte('data_contato', primeiroDia)
        .lte('data_contato', ultimoDiaStr)
        .in('status', ['novo', 'em_contato', 'agendado']);

      if (unidadeUUID) {
        leadsQuery = leadsQuery.eq('unidade_id', unidadeUUID);
      }

      const { data: leads } = await leadsQuery;

      if (leads && leads.length > 0) {
        const tresDiasAtras = new Date();
        tresDiasAtras.setDate(tresDiasAtras.getDate() - 3);
        
        const leadsSemContato = leads.filter(l => 
          !l.data_ultimo_contato || new Date(l.data_ultimo_contato) < tresDiasAtras
        ).length;

        if (leadsSemContato > 0) {
          alertasGerados.push({
            id: 'leads-abandonados',
            tipo: 'critico',
            titulo: `⚠️ ${leadsSemContato} lead(s) sem contato há 3+ dias!`,
            descricao: 'Faça follow-up imediato para não perder a oportunidade!',
            icone: <AlertTriangle className="w-5 h-5" />
          });
        }

        const totalPendentes = leads.length;
        if (totalPendentes > 0 && leadsSemContato === 0) {
          alertasGerados.push({
            id: 'leads-pendentes',
            tipo: 'info',
            titulo: `${totalPendentes} lead(s) em andamento`,
            descricao: 'Continue o acompanhamento para converter!',
            icone: <Users className="w-5 h-5" />
          });
        }
      }

      // 3. Buscar experimentais agendadas para hoje/amanhã
      const hojeStr = hoje.toISOString().split('T')[0];
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 1);
      const amanhaStr = amanha.toISOString().split('T')[0];

      let expQuery = supabase
        .from('leads')
        .select('id, nome, data_experimental')
        .eq('experimental_agendada', true)
        .eq('experimental_realizada', false)
        .gte('data_experimental', hojeStr)
        .lte('data_experimental', amanhaStr);

      if (unidadeUUID) {
        expQuery = expQuery.eq('unidade_id', unidadeUUID);
      }

      const { data: experimentais } = await expQuery;

      if (experimentais && experimentais.length > 0) {
        const expHoje = experimentais.filter(e => e.data_experimental === hojeStr).length;
        const expAmanha = experimentais.filter(e => e.data_experimental === amanhaStr).length;

        if (expHoje > 0) {
          alertasGerados.push({
            id: 'exp-hoje',
            tipo: 'info',
            titulo: `📅 ${expHoje} experimental(is) HOJE!`,
            descricao: 'Prepare-se para converter!',
            icone: <Bell className="w-5 h-5" />
          });
        }

        if (expAmanha > 0) {
          alertasGerados.push({
            id: 'exp-amanha',
            tipo: 'info',
            titulo: `📅 ${expAmanha} experimental(is) amanhã`,
            descricao: 'Confirme com os leads!',
            icone: <Bell className="w-5 h-5" />
          });
        }
      }

      setAlertas(alertasGerados);
    } catch (error) {
      console.error('Erro ao carregar alertas comerciais:', error);
    } finally {
      setLoading(false);
    }
  }

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
      case 'fire':
        return 'bg-orange-500/10 border-orange-500/30 text-orange-400';
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
