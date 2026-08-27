import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  RepescagemEnfileiramentoResultado,
  RepescagemEstado,
} from '../pesquisaEvasao.types';

/**
 * Le o estado da repescagem (2o toque) direto da tabela `pesquisa_evasao_envios_fila`.
 * Decisao registrada (task 8): nao passa por `listar_followups_pesquisa_evasao_v1` —
 * acrescentar coluna ao RETURNS TABLE dela exigiria DROP+CREATE, e recriar funcao
 * neste projeto reabre EXECUTE para `anon`. Nao vale o risco por um badge.
 */
export function useRepescagemEvasao(pesquisaIds: string[]) {
  const [estadoPorPesquisa, setEstado] = useState<Record<string, RepescagemEstado>>({});
  const [loading, setLoading] = useState(false);
  const chave = useMemo(() => [...pesquisaIds].sort().join(','), [pesquisaIds]);

  const recarregar = useCallback(async () => {
    if (pesquisaIds.length === 0) {
      setEstado({});
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('pesquisa_evasao_envios_fila')
      .select('pesquisa_id, status, agendada_para, enviada_em, ultimo_erro')
      .eq('toque', 2)
      .in('pesquisa_id', pesquisaIds);

    const mapa: Record<string, RepescagemEstado> = {};
    for (const linha of data ?? []) {
      mapa[linha.pesquisa_id as string] = linha as RepescagemEstado;
    }
    setEstado(mapa);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const enfileirar = useCallback(async (ids: string[]) => {
    const { data, error } = await supabase.rpc('enfileirar_repescagem_evasao', {
      p_pesquisa_ids: ids,
    });
    if (error) throw error;
    await recarregar();
    return data as RepescagemEnfileiramentoResultado;
  }, [recarregar]);

  const cancelar = useCallback(async (pesquisaId: string) => {
    const { error } = await supabase.rpc('cancelar_repescagem_evasao', {
      p_pesquisa_id: pesquisaId,
      p_motivo: 'cancelado na tela',
    });
    if (error) throw error;
    await recarregar();
  }, [recarregar]);

  return { estadoPorPesquisa, enfileirar, cancelar, recarregar, loading };
}
