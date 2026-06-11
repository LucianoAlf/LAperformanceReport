import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CaixaDiario } from '@/types/caixa';

interface UseCaixaHistoricoParams {
  unidadeId?: string | null;
  limite?: number;
  excluirData?: string;
}

export function useCaixaHistorico({ unidadeId, limite = 30, excluirData }: UseCaixaHistoricoParams) {
  const [historico, setHistorico] = useState<CaixaDiario[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!unidadeId || unidadeId === 'todos') {
      setHistorico([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('caixas_diarios')
        .select('*')
        .eq('unidade_id', unidadeId)
        .order('data_caixa', { ascending: false })
        .limit(limite);

      if (excluirData) {
        query = query.neq('data_caixa', excluirData);
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      setHistorico((data ?? []) as CaixaDiario[]);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar historico.');
    } finally {
      setLoading(false);
    }
  }, [unidadeId, limite, excluirData]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { historico, loading, error, carregar };
}
