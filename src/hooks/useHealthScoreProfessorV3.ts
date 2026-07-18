import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  HealthMetricKeyV3,
  HealthScoreV3SnapshotMetric,
} from '@/lib/healthScoreProfessorV3';

interface SnapshotRow {
  professor_id: number;
  unidade_id: string | null;
  competencia: string;
  score: number | null;
  cobertura: number | null;
  classificacao: string | null;
  estado: string;
  metrica: HealthMetricKeyV3;
  valor_bruto: number | null;
  nota: number | null;
  peso: number;
  meta: number | null;
  amostra: number | null;
  estado_base: string;
  confianca: string | null;
  motivo_sem_base: string | null;
}

interface UseHealthScoreProfessorV3Options {
  competencia: string;
  unidadeId?: string | null;
  professorId?: number | null;
  enabled?: boolean;
}

export function useHealthScoreProfessorV3({
  competencia,
  unidadeId = null,
  professorId = null,
  enabled = true,
}: UseHealthScoreProfessorV3Options) {
  const [metrics, setMetrics] = useState<HealthScoreV3SnapshotMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setMetrics([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const reference = /^\d{4}-\d{2}$/.test(competencia)
        ? `${competencia}-01`
        : competencia;
      const { data, error: rpcError } = await supabase.rpc(
        'get_health_score_professor_v3_snapshot_ui',
        {
          p_competencia: reference,
          p_unidade_id: unidadeId,
          p_professor_id: professorId,
        },
      );
      if (rpcError) throw rpcError;

      setMetrics(((data || []) as SnapshotRow[]).map((row) => ({
        professorId: row.professor_id,
        unidadeId: row.unidade_id,
        competencia: row.competencia,
        score: row.score ?? null,
        cobertura: row.cobertura ?? null,
        classificacao: row.classificacao ?? null,
        estado: row.estado,
        metrica: row.metrica,
        valorBruto: row.valor_bruto ?? null,
        nota: row.nota ?? null,
        peso: Number(row.peso),
        meta: row.meta ?? null,
        amostra: row.amostra ?? null,
        estadoBase: row.estado_base,
        confianca: row.confianca ?? null,
        motivoSemBase: row.motivo_sem_base ?? null,
      })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao carregar o Health Score V3.');
      setMetrics([]);
    } finally {
      setLoading(false);
    }
  }, [competencia, enabled, professorId, unidadeId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { metrics, loading, error, reload: load };
}
