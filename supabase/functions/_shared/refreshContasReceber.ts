export type FinanceiroSyncRunSnapshot = {
  id: string;
  competencia: string;
  run_type: string;
  status: string;
  completed_at: string | null;
  stale_after: string | null;
  unidades_concluidas: number;
  snapshot_complete: boolean;
  total_emusys: number;
  total_inseridos: number;
  total_atualizados: number;
  total_ausentes_marcados: number;
  units_summary: unknown;
};

export type FinanceiroActiveQueueJob = {
  id: string;
  competencia: string;
  status: 'pending' | 'running' | 'retry_wait';
  priority: number;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
};

export function currentCompetenciaSaoPaulo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) throw new Error('nao foi possivel resolver a competencia atual');
  return `${year}-${month}-01`;
}

export function resolveIncludeBacklog(
  requestedValue: unknown,
  competencias: string[],
  now = new Date(),
) {
  const isSpecificClosedMonth = competencias.length === 1
    && competencias[0] < currentCompetenciaSaoPaulo(now);
  if (isSpecificClosedMonth) return false;
  return requestedValue !== false;
}

export function isFreshCompleteSnapshot(
  run: FinanceiroSyncRunSnapshot | null,
  now = new Date(),
) {
  if (
    !run
    || run.run_type !== 'live'
    || run.status !== 'succeeded'
    || run.snapshot_complete !== true
    || run.unidades_concluidas !== 3
    || !run.completed_at
    || !run.stale_after
  ) return false;

  const staleAfter = Date.parse(run.stale_after);
  return Number.isFinite(staleAfter) && staleAfter >= now.getTime();
}

export function freshSnapshotPayload(run: FinanceiroSyncRunSnapshot) {
  return {
    ok: true,
    queued: false,
    queue_status: 'succeeded',
    next_attempt_at: null,
    sync_run_id: run.id,
    competencia: run.competencia,
    snapshot_complete: true,
    resultado: {
      sync_run_id: run.id,
      status: 'succeeded',
      competencia: run.competencia,
      snapshot_complete: true,
      unidades_concluidas: run.unidades_concluidas,
      total_emusys: run.total_emusys,
      total_inseridos: run.total_inseridos,
      total_atualizados: run.total_atualizados,
      total_ausentes_marcados: run.total_ausentes_marcados,
    },
    unidades: Array.isArray(run.units_summary) ? run.units_summary : [],
  };
}

export function activeQueuePayload(job: FinanceiroActiveQueueJob) {
  return {
    ok: true,
    queued: true,
    queue_status: job.status,
    next_attempt_at: job.next_attempt_at,
    sync_run_id: null,
    jobs: [job],
  };
}
