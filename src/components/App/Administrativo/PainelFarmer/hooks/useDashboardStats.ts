import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface ChecklistAlerta {
  checklist_id: string;
  titulo: string;
  descricao: string | null;
  data_prazo: string | null;
  prioridade: string;
  total_items: number;
  items_concluidos: number;
  percentual_progresso: number;
  dias_restantes: number;
  urgencia: 'vencido' | 'urgente' | 'normal';
  colaborador_nome: string;
  colaborador_apelido: string | null;
  unidade_id: string;
}

export interface DashboardStats {
  checklistsAtivos: number;
  checklistsConcluidos: number;
  tarefasPendentes: number;
  taxaSucessoContatos: number;
}

export function useDashboardStats(unidadeId: string) {
  const [checklistAlertas, setChecklistAlertas] = useState<ChecklistAlerta[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    checklistsAtivos: 0,
    checklistsConcluidos: 0,
    tarefasPendentes: 0,
    taxaSucessoContatos: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const unidadeFilter = unidadeId && unidadeId !== 'todos' ? unidadeId : null;

      // 1. Alertas de checklist (prazo vencendo, itens pendentes)
      let alertasQuery = supabase
        .from('vw_farmer_checklist_alertas')
        .select('*')
        .in('urgencia', ['vencido', 'urgente']);

      if (unidadeFilter) {
        alertasQuery = alertasQuery.eq('unidade_id', unidadeFilter);
      }

      const { data: alertasData } = await alertasQuery;
      setChecklistAlertas(alertasData || []);

      // 2. KPIs - Checklists ativos e concluídos
      const { data: checklistsData } = await supabase.rpc('get_checklists_farmer', {
        p_unidade_id: unidadeFilter,
        p_status: 'todos',
      });

      const ativos = (checklistsData || []).filter((c: { status: string }) => c.status === 'ativo').length;
      const concluidos = (checklistsData || []).filter((c: { status: string }) => c.status === 'concluido').length;

      // 3. Tarefas rápidas pendentes
      let tarefasQuery = supabase
        .from('farmer_tarefas')
        .select('id', { count: 'exact', head: true })
        .eq('contexto', 'farmer')
        .eq('concluida', false);

      if (unidadeFilter) {
        tarefasQuery = tarefasQuery.eq('unidade_id', unidadeFilter);
      }

      const { count: tarefasPendentes } = await tarefasQuery;

      // 4. Taxa de sucesso de contatos
      let contatosQuery = supabase
        .from('farmer_checklist_contatos')
        .select('status');

      // Filtrar por unidade via checklist
      if (unidadeFilter) {
        const checklistIds = (checklistsData || []).map((c: { id: string }) => c.id);
        if (checklistIds.length > 0) {
          contatosQuery = contatosQuery.in('checklist_id', checklistIds);
        }
      }

      const { data: contatosData } = await contatosQuery;
      const totalContatos = contatosData?.length || 0;
      const responderam = contatosData?.filter((c: { status: string }) => c.status === 'respondeu').length || 0;
      const taxaSucesso = totalContatos > 0 ? Math.round((responderam / totalContatos) * 100) : 0;

      setStats({
        checklistsAtivos: ativos,
        checklistsConcluidos: concluidos,
        tarefasPendentes: tarefasPendentes || 0,
        taxaSucessoContatos: taxaSucesso,
      });
    } catch (err) {
      console.error('Erro ao buscar stats da dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [unidadeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    checklistAlertas,
    stats,
    loading,
    refresh: fetchData,
  };
}
