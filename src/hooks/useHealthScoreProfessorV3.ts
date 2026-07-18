import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  HealthMetricKeyV3,
  HealthScoreV3SnapshotMetric,
} from '@/lib/healthScoreProfessorV3';

interface SnapshotRow {
  professor_id: number;
  unidade_id: string | null;
  escopo: string;
  competencia: string;
  trimestre_inicio: string;
  config_versao: number;
  score: number | null;
  cobertura: number | null;
  classificacao: string | null;
  estado: string;
  snapshot_publicavel: boolean;
  publicado: boolean;
  motivo_bloqueio: string | null;
  regra_versao_snapshot: string;
  metrica: HealthMetricKeyV3;
  valor_bruto: number | null;
  numerador: number | null;
  denominador: number | null;
  nota: number | null;
  peso: number;
  peso_disponivel: boolean;
  contribuicao: number | null;
  meta: number | null;
  amostra: number | null;
  estado_base: string;
  metrica_publicavel: boolean;
  confianca: string | null;
  fonte: string;
  regra_versao_metrica: string;
  motivo_sem_base: string | null;
  detalhes: Record<string, unknown> | null;
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
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!enabled) {
      setMetrics([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const reference = /^\d{4}-\d{2}$/.test(competencia)
        ? `${competencia}-01`
        : competencia;
      const { data, error: rpcError } = await supabase.rpc(
        'get_health_score_professor_v3_snapshot_modal',
        {
          p_competencia: reference,
          p_unidade_id: unidadeId,
          p_professor_id: professorId,
        },
      );
      if (rpcError) throw rpcError;
      if (requestId !== requestIdRef.current) return;

      setMetrics(((data || []) as SnapshotRow[]).map((row) => ({
        professorId: row.professor_id,
        unidadeId: row.unidade_id,
        escopo: row.escopo,
        competencia: row.competencia,
        trimestreInicio: row.trimestre_inicio,
        configVersao: Number(row.config_versao),
        score: row.score ?? null,
        cobertura: row.cobertura ?? null,
        classificacao: row.classificacao ?? null,
        estado: row.estado,
        snapshotPublicavel: Boolean(row.snapshot_publicavel),
        publicado: Boolean(row.publicado),
        motivoBloqueio: row.motivo_bloqueio ?? null,
        regraVersaoSnapshot: row.regra_versao_snapshot,
        metrica: row.metrica,
        valorBruto: row.valor_bruto ?? null,
        numerador: row.numerador ?? null,
        denominador: row.denominador ?? null,
        nota: row.nota ?? null,
        peso: Number(row.peso),
        pesoDisponivel: Boolean(row.peso_disponivel),
        contribuicao: row.contribuicao ?? null,
        meta: row.meta ?? null,
        amostra: row.amostra ?? null,
        estadoBase: row.estado_base,
        metricaPublicavel: Boolean(row.metrica_publicavel),
        confianca: row.confianca ?? null,
        fonte: row.fonte,
        regraVersaoMetrica: row.regra_versao_metrica,
        motivoSemBase: row.motivo_sem_base ?? null,
        detalhes: row.detalhes ?? {},
      })));
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      setError(caught instanceof Error ? caught.message : 'Falha ao carregar o Health Score V3.');
      setMetrics([]);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [competencia, enabled, professorId, unidadeId]);

  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  return { metrics, loading, error, reload: load };
}
