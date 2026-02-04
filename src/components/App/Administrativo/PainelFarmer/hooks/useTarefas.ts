import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { FarmerTarefa, CreateTarefaInput } from '../types';

export function useTarefas(colaboradorId: number | null, unidadeId: string) {
  const [tarefas, setTarefas] = useState<FarmerTarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTarefas = useCallback(async () => {
    if (!colaboradorId) return;
    
    try {
      setLoading(true);
      
      const { data, error: fetchError } = await supabase
        .from('farmer_tarefas')
        .select('*, alunos(nome), colaboradores(nome, apelido)')
        .eq('colaborador_id', colaboradorId)
        .order('concluida', { ascending: true })
        .order('data_prazo', { ascending: true, nullsFirst: false })
        .order('prioridade', { ascending: true })
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setTarefas(data || []);
    } catch (err) {
      console.error('Erro ao buscar tarefas:', err);
      setError('Erro ao carregar tarefas');
    } finally {
      setLoading(false);
    }
  }, [colaboradorId]);

  useEffect(() => {
    if (colaboradorId) {
      fetchTarefas();
    }
  }, [colaboradorId, fetchTarefas]);

  // Criar nova tarefa
  const criarTarefa = async (input: CreateTarefaInput) => {
    if (!colaboradorId) return;

    try {
      const { error: insertError } = await supabase
        .from('farmer_tarefas')
        .insert({
          colaborador_id: colaboradorId,
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
    atualizarTarefa,
    excluirTarefa
  };
}
