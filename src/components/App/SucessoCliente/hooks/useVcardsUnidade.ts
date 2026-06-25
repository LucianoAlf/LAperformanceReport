import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';

export interface VcardUnidade {
  id: string;
  unidade_id: string;
  titulo: string;
  full_name: string;
  telefones: string[];
  organizacao: string | null;
  email: string | null;
  url: string | null;
  ativo: boolean;
}

export interface VcardInput {
  unidade_id: string;
  titulo: string;
  full_name: string;
  telefones: string[];
  organizacao?: string | null;
  email?: string | null;
  url?: string | null;
}

export function useVcardsUnidade(unidadeAtual: UnidadeId) {
  const [cartoes, setCartoes] = useState<VcardUnidade[]>([]);
  const [loading, setLoading] = useState(false);

  const recarregar = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('vcards_unidade')
        .select('*')
        .eq('ativo', true)
        .order('titulo');
      if (unidadeAtual !== 'todos') query = query.eq('unidade_id', unidadeAtual);
      const { data, error } = await query;
      if (error) throw error;
      setCartoes((data || []) as VcardUnidade[]);
    } catch (err) {
      console.error('[useVcardsUnidade] Erro:', err);
      toast.error('Erro ao carregar cartões');
    } finally {
      setLoading(false);
    }
  }, [unidadeAtual]);

  useEffect(() => { recarregar(); }, [recarregar]);

  const criar = useCallback(async (input: VcardInput): Promise<VcardUnidade | null> => {
    try {
      const { data, error } = await supabase
        .from('vcards_unidade')
        .insert(input)
        .select('*')
        .single();
      if (error) throw error;
      await recarregar();
      toast.success('Cartão criado');
      return data as VcardUnidade;
    } catch (err) {
      console.error('[useVcardsUnidade] criar:', err);
      toast.error('Erro ao criar cartão');
      return null;
    }
  }, [recarregar]);

  const atualizar = useCallback(async (id: string, input: Partial<VcardInput>): Promise<boolean> => {
    try {
      const { error } = await supabase.from('vcards_unidade').update(input).eq('id', id);
      if (error) throw error;
      await recarregar();
      toast.success('Cartão atualizado');
      return true;
    } catch (err) {
      console.error('[useVcardsUnidade] atualizar:', err);
      toast.error('Erro ao atualizar cartão');
      return false;
    }
  }, [recarregar]);

  const excluir = useCallback(async (id: string): Promise<boolean> => {
    try {
      // soft delete (reversível)
      const { error } = await supabase.from('vcards_unidade').update({ ativo: false }).eq('id', id);
      if (error) throw error;
      await recarregar();
      toast.success('Cartão removido');
      return true;
    } catch (err) {
      console.error('[useVcardsUnidade] excluir:', err);
      toast.error('Erro ao remover cartão');
      return false;
    }
  }, [recarregar]);

  return { cartoes, loading, recarregar, criar, atualizar, excluir };
}
