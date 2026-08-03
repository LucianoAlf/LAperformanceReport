import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  buildHealthScoreV3DraftLoadState,
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
  startEditing: () => Promise<void>;
  restore: () => Promise<void>;
  apply: (configId: string, justificativa: string) => Promise<HealthScoreV3Config>;
}

const OPEN_CYCLE_REVISION_START = '2026-06-01';
const OPEN_CYCLE_REVISION_END = '2026-08-31';

function isOpenCycleRevision(
  config: Pick<HealthScoreV3Config, 'vigenciaInicio' | 'vigenciaFim'> | null | undefined,
): boolean {
  return config?.vigenciaInicio === OPEN_CYCLE_REVISION_START
    && config.vigenciaFim === OPEN_CYCLE_REVISION_END;
}

function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Nao foi possivel concluir a operacao.';
}

function isStatementTimeout(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === 'object'
      && 'code' in error
      && (error as { code?: unknown }).code === '57014',
  );
}

async function loadConfigUiWithRetry(competencia: string) {
  let response = await supabase.rpc(
    'get_health_score_professor_v3_config_ui',
    { p_competencia: competencia },
  );
  if (!isStatementTimeout(response.error)) return response;

  await new Promise((resolve) => window.setTimeout(resolve, 250));
  response = await supabase.rpc(
    'get_health_score_professor_v3_config_ui',
    { p_competencia: competencia },
  );
  return response;
}

export function useHealthScoreProfessorV3Config(
  competencia: string,
): UseHealthScoreProfessorV3ConfigReturn {
  const [config, setConfig] = useState<HealthScoreV3ConfigUi | null>(null);
  const [simulation, setSimulation] = useState<HealthScoreV3Simulation | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(() => {
    if (refreshInFlight.current) return refreshInFlight.current;

    const request = (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: rpcError } = await loadConfigUiWithRetry(competencia);
        if (rpcError) throw rpcError;
        const parsed = parseHealthScoreV3ConfigUi(data);
        const persistedGoals = parsed.rascunho?.metasSegmentadas
          || parsed.ativa?.metasSegmentadas
          || [];
        const loadState = buildHealthScoreV3DraftLoadState(
          persistedGoals,
          parsed.catalogoSegmentos || [],
        );
        setConfig({ ...parsed, matrizSegmentada: loadState.matrix });
      } catch (caught) {
        const message = messageFrom(caught);
        setError(message);
        throw caught;
      } finally {
        setLoading(false);
      }
    })();

    refreshInFlight.current = request;
    void request.finally(() => {
      if (refreshInFlight.current === request) refreshInFlight.current = null;
    }).catch(() => undefined);
    return request;
  }, [competencia]);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  const createDraft = useCallback(async (vigenciaInicio: string, justificativa: string) => {
    setMutating(true);
    setError(null);
    try {
      const activeConfig = config?.ativa;
      if (!activeConfig?.id) {
        throw new Error('Nao existe configuracao vigente para a competencia selecionada.');
      }
      const revisingOpenCycle = isOpenCycleRevision(activeConfig)
        && vigenciaInicio === OPEN_CYCLE_REVISION_START;
      const { data, error: rpcError } = revisingOpenCycle
        ? await supabase.rpc(
            'criar_health_score_professor_v3_config_revisao_ciclo_aberto',
            {
              p_config_origem_id: activeConfig.id,
              p_vigencia_inicio: OPEN_CYCLE_REVISION_START,
              p_vigencia_fim: OPEN_CYCLE_REVISION_END,
              p_justificativa: justificativa,
            },
          )
        : await supabase.rpc(
            'criar_health_score_professor_v3_config_rascunho',
            {
              p_vigencia_inicio: vigenciaInicio,
              p_justificativa: justificativa,
              p_config_origem_id: activeConfig.id,
            },
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
  }, [config?.ativa, refresh]);

  const startEditing = useCallback(async (): Promise<void> => {
    if (config?.rascunho) return;
    if (!config?.ativa) {
      throw new Error('Nao existe configuracao vigente para iniciar o ajuste.');
    }
    await createDraft(
      config.ativa.vigenciaInicio,
      'Ajuste no laboratorio do Health Score V3',
    );
  }, [config?.ativa, config?.rascunho, createDraft]);

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
      const draftConfig = config?.rascunho?.id === configId
        ? config.rascunho
        : null;
      const activationRpc = isOpenCycleRevision(draftConfig)
        ? 'ativar_health_score_professor_v3_config_revisao_ciclo_aberto'
        : 'ativar_health_score_professor_v3_config';
      const { data, error: rpcError } = await supabase.rpc(
        activationRpc,
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
  }, [config?.rascunho, refresh]);

  const restore = useCallback(async (): Promise<void> => {
    setSimulation(null);
    await refresh();
  }, [refresh]);

  const apply = useCallback(
    (configId: string, justificativa: string) => activate(configId, justificativa),
    [activate],
  );

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
    startEditing,
    restore,
    apply,
  };
}
