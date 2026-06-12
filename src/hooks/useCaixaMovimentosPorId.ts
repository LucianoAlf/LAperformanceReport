import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CaixaMovimentacao } from '@/types/caixa';

export function useCaixaMovimentosPorId(caixaDiarioId: string | null) {
  const [movimentos, setMovimentos] = useState<CaixaMovimentacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!caixaDiarioId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('caixa_movimentacoes')
        .select('*')
        .eq('caixa_diario_id', caixaDiarioId)
        .order('created_at', { ascending: true });
      if (queryError) throw queryError;
      setMovimentos((data ?? []) as CaixaMovimentacao[]);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar movimentos.');
    } finally {
      setLoading(false);
    }
  }, [caixaDiarioId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { movimentos, loading, error };
}
