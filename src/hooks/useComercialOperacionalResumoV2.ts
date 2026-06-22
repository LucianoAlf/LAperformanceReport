import { useCallback, useEffect, useState } from 'react';
import {
  buildComercialOperacionalRpcParamsV2,
  type ComercialOperacionalMesV2,
  type ComercialOperacionalPayloadV2,
  type ComercialOperacionalResumoDadosV2,
  type ExperimentaisDiagnosticoMesV2,
  type ExperimentaisDiagnosticoPayloadV2,
  type ExperimentaisDiagnosticoResumoV2,
  normalizarMesRange,
  normalizarPayloadMensalExperimentaisDiagnosticoV2,
  normalizarPayloadMensalComercialV2,
  somarSeriesMensaisExperimentaisDiagnosticoV2,
  somarSeriesMensaisComercialV2,
} from '../lib/comercialOperacionalV2';
import { supabase } from '../lib/supabase';

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

export async function fetchComercialOperacionalResumoV2({
  unidadeId,
  ano,
  mesInicio,
  mesFim,
}: FetchLeadsComercialV2Params): Promise<ComercialOperacionalResumoDadosV2> {
  const meses = normalizarMesRange(mesInicio, mesFim);

  const seriesMensais: ComercialOperacionalMesV2[] = await Promise.all(meses.map(async (mes) => {
    const { data, error } = await supabase.rpc(
      'get_kpis_comercial_canonicos_v2',
      buildComercialOperacionalRpcParamsV2({
        unidadeId,
        ano,
        mes,
      }),
    );

    if (error) {
      throw new Error(
        `Erro ao buscar leads comerciais v2 ${ano}-${String(mes).padStart(2, '0')}: ${error.message}`,
      );
    }

    return normalizarPayloadMensalComercialV2(mes, data as ComercialOperacionalPayloadV2 | null);
  }));

  return somarSeriesMensaisComercialV2(seriesMensais);
}

export async function fetchLeadsEntrantesComercialV2(
  params: FetchLeadsComercialV2Params,
): Promise<number> {
  const resumo = await fetchComercialOperacionalResumoV2(params);
  return resumo.leadsEntrantes;
}

export async function fetchExperimentaisDiagnosticoComercialV2({
  unidadeId,
  ano,
  mesInicio,
  mesFim,
}: FetchLeadsComercialV2Params): Promise<ExperimentaisDiagnosticoResumoV2> {
  const meses = normalizarMesRange(mesInicio, mesFim);

  const seriesMensais: ExperimentaisDiagnosticoMesV2[] = await Promise.all(meses.map(async (mes) => {
    const { data, error } = await supabase.rpc(
      'get_conciliacao_experimentais_v2',
      buildComercialOperacionalRpcParamsV2({
        unidadeId,
        ano,
        mes,
      }),
    );

    if (error) {
      throw new Error(
        `Erro ao buscar diagnóstico de experimentais v2 ${ano}-${String(mes).padStart(2, '0')}: ${error.message}`,
      );
    }

    return normalizarPayloadMensalExperimentaisDiagnosticoV2(
      mes,
      data as ExperimentaisDiagnosticoPayloadV2 | null,
    );
  }));

  return somarSeriesMensaisExperimentaisDiagnosticoV2(seriesMensais);
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
