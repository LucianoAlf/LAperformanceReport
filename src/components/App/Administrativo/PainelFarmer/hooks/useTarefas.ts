import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { FarmerTarefa, CreateTarefaInput, Colaborador } from '../types';

interface UseTarefasOptions {
  colaboradorId: number | null;
  unidadeId: string;
  colaborador?: Colaborador | null;
}

export function useTarefas({ colaboradorId, unidadeId, colaborador }: UseTarefasOptions) {
  const [tarefas, setTarefas] = useState<FarmerTarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTarefas = useCallback(async () => {
    if (!colaboradorId) return;
    
    try {
      setLoading(true);
      
      const isAdmin = colaborador?.tipo === 'admin';
      console.log('[useTarefas] isAdmin:', isAdmin, 'colaborador:', colaborador?.tipo);
      
      let query = supabase
        .from('farmer_tarefas')
        .select('*, alunos(nome), colaboradores(nome, apelido)');
      
      // Se não for admin, filtrar apenas tarefas atribuídas ao colaborador logado
      if (!isAdmin) {
        query = query.eq('colaborador_id', colaboradorId);
      }

      // Filtrar por unidade quando não for "todos"
      if (unidadeId && unidadeId !== 'todos') {
        query = query.eq('unidade_id', unidadeId);
      }

      const { data, error: fetchError } = await query
        .order('concluida', { ascending: true })
        .order('data_prazo', { ascending: true, nullsFirst: false })
        .order('prioridade', { ascending: true })
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      console.log('[useTarefas] Total tarefas carregadas:', data?.length);
      console.log('[useTarefas] Tarefas:', data?.map(t => ({ id: t.id, descricao: t.descricao, colaborador_id: t.colaborador_id })));
      setTarefas(data || []);
    } catch (err) {
      console.error('Erro ao buscar tarefas:', err);
      setError('Erro ao carregar tarefas');
    } finally {
      setLoading(false);
    }
  }, [colaboradorId, unidadeId, colaborador]);

  useEffect(() => {
    if (colaboradorId) {
      fetchTarefas();
    }
  }, [colaboradorId, fetchTarefas]);

  // Criar nova tarefa
  const criarTarefa = async (input: CreateTarefaInput, atribuirParaId?: number) => {
    if (!colaboradorId) return;

    try {
      const { error: insertError } = await supabase
        .from('farmer_tarefas')
        .insert({
          colaborador_id: atribuirParaId || colaboradorId,
          unidade_id: unidadeId,
          ...input
        });

      if (insertError) throw insertError;
      await fetchTarefas();
    } catch (err) {
      console.error('Erro ao criar tarefa:', err);
      throw err;
    }
  };

  // Marcar tarefa como concluída
  const marcarConcluida = async (id: string, concluida: boolean) => {
    try {
      const { error: updateError } = await supabase
        .from('farmer_tarefas')
        .update({ 
          concluida, 
          concluida_em: concluida ? new Date().toISOString() : null 
        })
        .eq('id', id);

      if (updateError) throw updateError;
      
      // Atualizar estado local
      setTarefas(prev => 
        prev.map(t => t.id === id ? { ...t, concluida, concluida_em: concluida ? new Date().toISOString() : undefined } : t)
      );
    } catch (err) {
      console.error('Erro ao marcar tarefa:', err);
      throw err;
    }
  };

  // Atualizar tarefa
  const atualizarTarefa = async (id: string, input: Partial<CreateTarefaInput>) => {
    try {
      const { error: updateError } = await supabase
        .from('farmer_tarefas')
        .update(input)
        .eq('id', id);

      if (updateError) throw updateError;
      await fetchTarefas();
    } catch (err) {
      console.error('Erro ao atualizar tarefa:', err);
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
      console.error('Erro ao excluir tarefa:', err);
      throw err;
    }
  };

  // Filtrar tarefas
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
  // Tarefas pendentes sem prazo definido
  const tarefasSemPrazo = tarefasPendentes.filter(t => !t.data_prazo);

  return {
    tarefas,
    tarefasPendentes,
    tarefasConcluidas,
    tarefasHoje,
    tarefasAtrasadas,
    tarefasSemPrazo,
    loading,
    error,
    refresh: fetchTarefas,
    criarTarefa,
    marcarConcluida,
    atualizarTarefa,
    excluirTarefa
  };
}
