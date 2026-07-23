import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  normalizeHealthScoreV3PerformanceRows,
  type HealthScoreV3ProfessorPerformance,
} from '@/lib/healthScoreProfessorV3Performance';

interface Options {
  competencia: string;
  unidadeId?: string | null;
  periodicidade?: 'mensal' | 'ciclo';
  enabled?: boolean;
}

export function useHealthScoreProfessorV3Performance({
  competencia,
  unidadeId = null,
  periodicidade = 'mensal',
  enabled = true,
}: Options) {
  const [snapshots, setSnapshots] = useState<HealthScoreV3ProfessorPerformance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const requestKey = [
    enabled ? 'enabled' : 'disabled',
    competencia,
    unidadeId ?? 'consolidado',
    periodicidade,
  ].join(':');

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!enabled) {
      setSnapshots([]);
      setError(null);
      setLoading(false);
      setLoadedRequestKey(requestKey);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const reference = /^\d{4}-\d{2}$/.test(competencia)
        ? `${competencia}-01`
        : competencia;
      const { data, error: rpcError } = await supabase.rpc(
        'get_health_score_professor_v3_performance',
        {
          p_competencia: reference,
          p_unidade_id: unidadeId,
          p_periodicidade: periodicidade,
        },
      );
      if (rpcError) throw rpcError;
      if (requestId !== requestIdRef.current) return;

      setSnapshots(normalizeHealthScoreV3PerformanceRows(data || []));
      setLoadedRequestKey(requestKey);
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      setSnapshots([]);
      setError(caught instanceof Error ? caught.message : 'Falha ao carregar a Performance V3.');
      setLoadedRequestKey(requestKey);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [competencia, enabled, periodicidade, requestKey, unidadeId]);

  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  return {
    snapshots: loadedRequestKey === requestKey ? snapshots : [],
    loading: loading || (enabled && loadedRequestKey !== requestKey),
    error: loadedRequestKey === requestKey ? error : null,
    reload: load,
  };
}
