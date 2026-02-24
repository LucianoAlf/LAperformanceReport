import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { TarefaRapida, CreateTarefaRapidaInput, TarefaContexto } from './types';

interface UseTarefasRapidasOptions {
  contexto: TarefaContexto;
  colaboradorId: number | null;
  unidadeId: string;
  colaboradorUnidadeId?: string;
  isAdmin?: boolean;
}

export function useTarefasRapidas({ contexto, colaboradorId, unidadeId, colaboradorUnidadeId, isAdmin }: UseTarefasRapidasOptions) {
  const [tarefas, setTarefas] = useState<TarefaRapida[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTarefas = useCallback(async () => {
    if (!colaboradorId) return;

    try {
      setLoading(true);

      let query = supabase
        .from('farmer_tarefas')
        .select('*, colaboradores(nome, apelido)')
        .eq('contexto', contexto);

      // Usuários normais veem todas as tarefas da sua unidade
      // Admins veem tudo (sem filtro de unidade quando "todos")
      if (unidadeId && unidadeId !== 'todos') {
        query = query.eq('unidade_id', unidadeId);
      }

      const { data, error: fetchError } = await query
        .order('concluida', { ascending: true })
        .order('data_prazo', { ascending: true, nullsFirst: false })
        .order('prioridade', { ascending: true })
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setTarefas(data || []);
    } catch (err) {
      console.error('[useTarefasRapidas] Erro ao buscar tarefas:', err);
      setError('Erro ao carregar tarefas');
    } finally {
      setLoading(false);
    }
  }, [colaboradorId, unidadeId, contexto, isAdmin]);

  useEffect(() => {
    if (colaboradorId) {
      fetchTarefas();
    }
  }, [colaboradorId, fetchTarefas]);

  // Criar nova tarefa
  const criarTarefa = async (input: CreateTarefaRapidaInput, unidadeIdOverride?: string) => {
    if (!colaboradorId) return;

    // Resolver unidade: override do modal > filtro global > unidade do colaborador
    const unidadeParaSalvar = unidadeIdOverride || (unidadeId !== 'todos' ? unidadeId : colaboradorUnidadeId);
    if (!unidadeParaSalvar) return;

    try {
      const { error: insertError } = await supabase
        .from('farmer_tarefas')
        .insert({
          colaborador_id: colaboradorId,
          unidade_id: unidadeParaSalvar,
          contexto,
          ...input,
        });

      if (insertError) throw insertError;
      await fetchTarefas();
    } catch (err) {
      console.error('[useTarefasRapidas] Erro ao criar tarefa:', err);
      throw err;
    }
  };

  // Marcar tarefa como concluída/pendente
  const marcarConcluida = async (id: string, concluida: boolean) => {
    try {
      const { error: updateError } = await supabase
        .from('farmer_tarefas')
        .update({
          concluida,
          concluida_em: concluida ? new Date().toISOString() : null,
        })
        .eq('id', id);

      if (updateError) throw updateError;

      // Atualizar estado local
      setTarefas(prev =>
        prev.map(t =>
          t.id === id
            ? { ...t, concluida, concluida_em: concluida ? new Date().toISOString() : undefined }
            : t
        )
      );
    } catch (err) {
      console.error('[useTarefasRapidas] Erro ao marcar tarefa:', err);
      throw err;
    }
  };

  // Excluir tarefa
  const excluirTarefa = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('farmer_tarefas')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      await fetchTarefas();
    } catch (err) {
      console.error('[useTarefasRapidas] Erro ao excluir tarefa:', err);
      throw err;
    }
  };

  // Filtros computados
  const tarefasPendentes = tarefas.filter(t => !t.concluida);
  const tarefasConcluidas = tarefas.filter(t => t.concluida);
  const tarefasHoje = tarefasPendentes.filter(t => {
    if (!t.data_prazo) return false;
    const hoje = new Date().toISOString().split('T')[0];
    return t.data_prazo === hoje;
  });
  const tarefasAtrasadas = tarefasPendentes.filter(t => {
    if (!t.data_prazo) return false;
    const hoje = new Date().toISOString().split('T')[0];
    return t.data_prazo < hoje;
  });

  return {
    tarefas,
    tarefasPendentes,
    tarefasConcluidas,
    tarefasHoje,
    tarefasAtrasadas,
    loading,
    error,
    refresh: fetchTarefas,
    criarTarefa,
    marcarConcluida,
    excluirTarefa,
  };
}
