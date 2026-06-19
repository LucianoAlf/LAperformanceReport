import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface KPIsComercialCanonicosV2Payload {
  kpis?: {
    leads_entrantes?: number | string | null;
  };
}

interface FetchLeadsComercialV2Params {
  unidadeId: string | 'todos';
  ano: number;
  mesInicio: number;
  mesFim: number;
}

interface UseComercialOperacionalResumoV2Params extends FetchLeadsComercialV2Params {
  enabled?: boolean;
}

export interface ComercialOperacionalResumoV2 {
  leadsEntrantes: number | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

function toNumber(valor: unknown): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function normalizarMesRange(mesInicio: number, mesFim: number): number[] {
  const inicio = Math.max(1, Math.min(12, Math.trunc(mesInicio)));
  const fim = Math.max(inicio, Math.min(12, Math.trunc(mesFim)));

  return Array.from({ length: fim - inicio + 1 }, (_, index) => inicio + index);
}

export async function fetchLeadsEntrantesComercialV2({
  unidadeId,
  ano,
  mesInicio,
  mesFim,
}: FetchLeadsComercialV2Params): Promise<number> {
  const unidadeParam = unidadeId === 'todos' ? null : unidadeId;
  const meses = normalizarMesRange(mesInicio, mesFim);
  let totalLeads = 0;

  for (const mes of meses) {
    const { data, error } = await supabase.rpc('get_kpis_comercial_canonicos_v2', {
      p_unidade_id: unidadeParam,
      p_ano: ano,
      p_mes: mes,
      p_periodo: 'mensal',
      p_data: null,
    });

    if (error) {
      throw new Error(
        `Erro ao buscar leads comerciais v2 ${ano}-${String(mes).padStart(2, '0')}: ${error.message}`,
      );
    }

    const payload = data as KPIsComercialCanonicosV2Payload | null;
    totalLeads += toNumber(payload?.kpis?.leads_entrantes);
  }

  return totalLeads;
}

export function useComercialOperacionalResumoV2({
  unidadeId,
  ano,
  mesInicio,
  mesFim,
  enabled = true,
}: UseComercialOperacionalResumoV2Params): ComercialOperacionalResumoV2 {
  const [leadsEntrantes, setLeadsEntrantes] = useState<number | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const fetchResumo = useCallback(async () => {
    if (!enabled) {
      setLeadsEntrantes(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const totalLeads = await fetchLeadsEntrantesComercialV2({
        unidadeId,
        ano,
        mesInicio,
        mesFim,
      });

      setLeadsEntrantes(totalLeads);
    } catch (err: any) {
      setLeadsEntrantes(null);
      setError(err?.message || 'Erro ao buscar leads comerciais v2');
      console.error('Erro ao buscar leads comerciais v2:', err);
    } finally {
      setLoading(false);
    }
  }, [ano, enabled, mesFim, mesInicio, unidadeId]);

  useEffect(() => {
    fetchResumo();
  }, [fetchResumo]);

  return {
    leadsEntrantes,
    loading,
    error,
    refetch: fetchResumo,
  };
}
