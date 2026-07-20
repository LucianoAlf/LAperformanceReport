import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  parseHealthScoreV3Config,
  parseHealthScoreV3ConfigUi,
  parseHealthScoreV3Simulation,
  serializeHealthScoreV3Metrics,
  serializeHealthScoreV3SegmentGoals,
  type HealthScoreV3Config,
  type HealthScoreV3ConfigUi,
  type HealthScoreV3Simulation,
} from '@/lib/healthScoreProfessorV3';

interface UseHealthScoreProfessorV3ConfigReturn {
  config: HealthScoreV3ConfigUi | null;
  simulation: HealthScoreV3Simulation | null;
  loading: boolean;
  mutating: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
  createDraft: (vigenciaInicio: string, justificativa: string) => Promise<HealthScoreV3Config>;
  saveDraft: (draft: HealthScoreV3Config) => Promise<HealthScoreV3Config>;
  simulate: (configId: string, competencia: string) => Promise<HealthScoreV3Simulation>;
  activate: (configId: string, justificativa: string) => Promise<HealthScoreV3Config>;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Nao foi possivel concluir a operacao.';
}

export function useHealthScoreProfessorV3Config(): UseHealthScoreProfessorV3ConfigReturn {
  const [config, setConfig] = useState<HealthScoreV3ConfigUi | null>(null);
  const [simulation, setSimulation] = useState<HealthScoreV3Simulation | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_health_score_professor_v3_config_ui');
      if (rpcError) throw rpcError;
      setConfig(parseHealthScoreV3ConfigUi(data));
    } catch (caught) {
      const message = messageFrom(caught);
      setError(message);
      throw caught;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  const createDraft = useCallback(async (vigenciaInicio: string, justificativa: string) => {
    setMutating(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('criar_health_score_professor_v3_config_rascunho',
        { p_vigencia_inicio: vigenciaInicio, p_justificativa: justificativa },
      );
      if (rpcError) throw rpcError;
      const draft = parseHealthScoreV3Config(data);
      if (!draft) throw new Error('A RPC nao retornou o rascunho criado.');
      await refresh();
      return draft;
    } catch (caught) {
      setError(messageFrom(caught));
      throw caught;
    } finally {
      setMutating(false);
    }
  }, [refresh]);

  const saveDraft = useCallback(async (draft: HealthScoreV3Config) => {
    setMutating(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('salvar_health_score_professor_v3_config_rascunho',
        {
          p_config_id: draft.id,
          p_vigencia_inicio: draft.vigenciaInicio,
          p_justificativa: draft.justificativa,
          p_metricas: serializeHealthScoreV3Metrics(draft.metricas),
          p_metas_segmentadas: serializeHealthScoreV3SegmentGoals(draft.metasSegmentadas),
        },
      );
      if (rpcError) throw rpcError;
      const saved = parseHealthScoreV3Config(data);
      if (!saved) throw new Error('A RPC nao retornou o rascunho salvo.');
      await refresh();
      setSimulation(null);
      return saved;
    } catch (caught) {
      setError(messageFrom(caught));
      throw caught;
    } finally {
      setMutating(false);
    }
  }, [refresh]);

  const simulate = useCallback(async (configId: string, competencia: string) => {
    setMutating(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('simular_health_score_professor_v3_config',
        { p_config_id: configId, p_competencia: competencia },
      );
      if (rpcError) throw rpcError;
      const result = parseHealthScoreV3Simulation(data);
      setSimulation(result);
      return result;
    } catch (caught) {
      setError(messageFrom(caught));
      throw caught;
    } finally {
      setMutating(false);
    }
  }, []);

  const activate = useCallback(async (configId: string, justificativa: string) => {
    setMutating(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'ativar_health_score_professor_v3_config',
        { p_config_id: configId, p_justificativa: justificativa },
      );
      if (rpcError) throw rpcError;
      const active = parseHealthScoreV3Config(data);
      if (!active) throw new Error('A RPC nao retornou a versao ativada.');
      await refresh();
      setSimulation(null);
      return active;
    } catch (caught) {
      setError(messageFrom(caught));
      throw caught;
    } finally {
      setMutating(false);
    }
  }, [refresh]);

  return {
    config,
    simulation,
    loading,
    mutating,
    error,
    refresh,
    reload: refresh,
    createDraft,
    saveDraft,
    simulate,
    activate,
  };
}
