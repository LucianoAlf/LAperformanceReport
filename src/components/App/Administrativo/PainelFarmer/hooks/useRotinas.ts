import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { FarmerRotina, FarmerRotinaDoDia, ProgressoRotinas, CreateRotinaInput } from '../types';

export function useRotinas(colaboradorId: number | null, unidadeId: string) {
  const [rotinas, setRotinas] = useState<FarmerRotina[]>([]);
  const [rotinasDoDia, setRotinasDoDia] = useState<FarmerRotinaDoDia[]>([]);
  const [progresso, setProgresso] = useState<ProgressoRotinas>({ total: 0, concluidas: 0, percentual: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carregar todas as rotinas do colaborador
  const fetchRotinas = useCallback(async () => {
    if (!colaboradorId) return;
    
    try {
      const { data, error: fetchError } = await supabase
        .from('farmer_rotinas')
        .select('*, colaboradores(nome, apelido)')
        .eq('colaborador_id', colaboradorId)
        .eq('ativo', true)
        .order('prioridade', { ascending: false })
        .order('descricao');

      if (fetchError) throw fetchError;
      setRotinas(data || []);
    } catch (err) {
      console.error('Erro ao buscar rotinas:', err);
      setError('Erro ao carregar rotinas');
    }
  }, [colaboradorId]);

  // Carregar rotinas do dia via RPC
  const fetchRotinasDoDia = useCallback(async () => {
    if (!colaboradorId) return;
    
    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_rotinas_do_dia', { p_colaborador_id: colaboradorId });

      if (fetchError) throw fetchError;
      setRotinasDoDia(data || []);
    } catch (err) {
      console.error('Erro ao buscar rotinas do dia:', err);
      setError('Erro ao carregar rotinas do dia');
    }
  }, [colaboradorId]);

  // Carregar progresso do dia via RPC
  const fetchProgresso = useCallback(async () => {
    if (!colaboradorId) return;
    
    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_progresso_rotinas_hoje', { p_colaborador_id: colaboradorId });

      if (fetchError) throw fetchError;
      if (data && data.length > 0) {
        setProgresso(data[0]);
      }
    } catch (err) {
      console.error('Erro ao buscar progresso:', err);
    }
  }, [colaboradorId]);

  // Carregar tudo
  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchRotinas(), fetchRotinasDoDia(), fetchProgresso()]);
    setLoading(false);
  }, [fetchRotinas, fetchRotinasDoDia, fetchProgresso]);

  useEffect(() => {
    if (colaboradorId) {
      refresh();
    }
  }, [colaboradorId, refresh]);

  // Marcar rotina como concluída
  const marcarConcluida = async (rotinaId: string, concluida: boolean) => {
    if (!colaboradorId) return;

    try {
      const { error: rpcError } = await supabase
        .rpc('marcar_rotina_concluida', {
          p_rotina_id: rotinaId,
          p_colaborador_id: colaboradorId,
          p_concluida: concluida
        });

      if (rpcError) throw rpcError;

      // Atualizar estado local
      setRotinasDoDia(prev => 
        prev.map(r => r.rotina_id === rotinaId ? { ...r, concluida } : r)
      );

      // Atualizar progresso
      await fetchProgresso();
    } catch (err) {
      console.error('Erro ao marcar rotina:', err);
      throw err;
    }
  };

  // Criar nova rotina
  const criarRotina = async (input: CreateRotinaInput) => {
    if (!colaboradorId) return;

    try {
      const { error: insertError } = await supabase
        .from('farmer_rotinas')
        .insert({
          colaborador_id: colaboradorId,
          unidade_id: unidadeId,
          ...input
        });

      if (insertError) throw insertError;
      await refresh();
    } catch (err) {
      console.error('Erro ao criar rotina:', err);
      throw err;
    }
  };

  // Atualizar rotina
  const atualizarRotina = async (id: string, input: Partial<CreateRotinaInput>) => {
    try {
      const { error: updateError } = await supabase
        .from('farmer_rotinas')
        .update(input)
        .eq('id', id);

      if (updateError) throw updateError;
      await refresh();
    } catch (err) {
      console.error('Erro ao atualizar rotina:', err);
      throw err;
    }
  };

  // Excluir rotina (soft delete)
  const excluirRotina = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('farmer_rotinas')
        .update({ ativo: false })
        .eq('id', id);

      if (deleteError) throw deleteError;
      await refresh();
    } catch (err) {
      console.error('Erro ao excluir rotina:', err);
      throw err;
    }
  };

  return {
    rotinas,
    rotinasDoDia,
    progresso,
    loading,
    error,
    refresh,
    marcarConcluida,
    criarRotina,
    atualizarRotina,
    excluirRotina
  };
}
