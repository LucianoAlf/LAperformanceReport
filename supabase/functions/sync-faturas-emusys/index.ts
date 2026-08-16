/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import {
  coletarFaturasUnidade,
  GlobalRateLimiter,
  type UnidadeSyncConfig,
} from '../_shared/faturasSync.ts';
import {
  classifyFinanceiroSyncError,
  type FinanceiroQueueJob,
  syncErrorMessage,
} from '../_shared/financeiroSyncQueue.ts';
import { isServiceRoleJwtForProject } from '../_shared/financeiroSyncAuthorization.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0] ?? '';
const EMUSYS_API = 'https://api.emusys.com.br/v1';

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Secret obrigatorio ausente: ${name}`);
  return value;
};

const EMAILS_SYNC_TECNICO = new Set(
  (Deno.env.get('SYNC_FATURAS_ALLOWED_EMAILS')
    ?? Deno.env.get('SYNC_MATRICULAS_ALLOWED_EMAILS')
    ?? 'lucianoalf.la@gmail.com,hugo@lamusic.com.br')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

const SYNC_ADMIN_TOKEN = Deno.env.get('SYNC_FATURAS_ADMIN_TOKEN')?.trim()
  || Deno.env.get('SYNC_MATRICULAS_ADMIN_TOKEN')?.trim()
  || '';

const UNIDADES: Record<string, UnidadeSyncConfig> = {
  cg: {
    nome: 'Campo Grande',
    id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
    token: Deno.env.get('EMUSYS_TOKEN_CAMPO_GRANDE')?.trim() || requiredEnv('EMUSYS_TOKEN_CG'),
  },
  recreio: {
    nome: 'Recreio',
    id: '95553e96-971b-4590-a6eb-0201d013c14d',
    token: requiredEnv('EMUSYS_TOKEN_RECREIO'),
  },
  barra: {
    nome: 'Barra',
    id: '368d47f5-2d88-4475-bc14-ba084a9a348e',
    token: requiredEnv('EMUSYS_TOKEN_BARRA'),
  },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

type ServiceClient = SupabaseClient;

type AccessResult = {
  denied?: Response;
  isServiceRole: boolean;
  requestedBy: string;
};

type QueueRpcResult = Record<string, unknown> & {
  status?: string;
  next_attempt_at?: string | null;
  sync_run_id?: string | null;
  jobs?: Array<Record<string, unknown>>;
};

type ProcessResult = {
  status: number;
  body: Record<string, unknown>;
};

async function validarAcessoSync(req: Request): Promise<AccessResult> {
  const syncToken = req.headers.get('x-sync-token')?.trim() || '';
  if (SYNC_ADMIN_TOKEN && syncToken && syncToken === SYNC_ADMIN_TOKEN) {
    return { isServiceRole: false, requestedBy: 'sync_admin_token' };
  }

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return {
      denied: json({ ok: false, erro: 'sync restrito a usuarios tecnicos' }, 403),
      isServiceRole: false,
      requestedBy: 'anonymous',
    };
  }
  // O gateway valida a assinatura porque verify_jwt=true. A igualdade literal
  // continua como caminho rapido, mas chaves legacy podem divergir da geracao
  // injetada em SUPABASE_SERVICE_ROLE_KEY; nesse caso confiamos nos claims ja
  // validados e ainda exigimos o ref deste projeto.
  if (
    token === SUPABASE_SERVICE_ROLE_KEY
    || isServiceRoleJwtForProject(token, SUPABASE_PROJECT_REF)
  ) {
    return { isServiceRole: true, requestedBy: 'service_role' };
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await authClient.auth.getUser(token);
  const email = data.user?.email?.trim().toLowerCase() || '';
  if (error || !email || !EMAILS_SYNC_TECNICO.has(email)) {
    return {
      denied: json({ ok: false, erro: 'sync restrito a usuarios tecnicos' }, 403),
      isServiceRole: false,
      requestedBy: email || 'jwt_invalido',
    };
  }
  return { isServiceRole: false, requestedBy: email };
}

function validateCompetencia(value: unknown) {
  const competencia = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-01$/.test(competencia)) {
    throw new Error('competencia obrigatoria no formato YYYY-MM-01');
  }
  const parsed = new Date(`${competencia}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== competencia) {
    throw new Error('competencia invalida');
  }
  return competencia;
}

function competenciaFromLegacy(body: Record<string, unknown>) {
  const ano = Number(body.ano);
  const mes = Number(body.mes);
  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) throw new Error('ano invalido');
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new Error('mes invalido');
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

function parseCompetencias(body: Record<string, unknown>) {
  let values: unknown[] = [];
  if (Array.isArray(body.competencias)) values = body.competencias;
  else if (body.competencia != null) values = [body.competencia];
  else if (body.ano != null || body.mes != null) values = [competenciaFromLegacy(body)];

  if (values.length > 24) throw new Error('informe no maximo 24 competencias');
  return [...new Set(values.map(validateCompetencia))].sort();
}

async function rpcOrThrow<T>(
  supabase: ServiceClient,
  functionName: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc(functionName, args);
  if (error) throw error;
  return data as T;
}

function queueStateFromEnqueues(enqueues: QueueRpcResult[]) {
  const jobs = enqueues.flatMap((result) => Array.isArray(result.jobs) ? result.jobs : []);
  const statusOrder = ['running', 'retry_wait', 'pending'];
  const status = statusOrder.find((candidate) => jobs.some((job) => job.status === candidate))
    ?? 'idle';
  const nextAttemptAt = jobs
    .map((job) => typeof job.next_attempt_at === 'string' ? job.next_attempt_at : null)
    .filter((value): value is string => value != null)
    .sort()[0] ?? null;
  return { jobs, status, nextAttemptAt };
}

async function executarProbe(competencia: string, unidadeCodigo: string) {
  const unidade = UNIDADES[unidadeCodigo];
  const collected = await coletarFaturasUnidade({
    apiBaseUrl: EMUSYS_API,
    competencia,
    unidadeCodigo,
    unidade,
    limiter: new GlobalRateLimiter(),
  });

  return {
    competencia,
    unidade: unidadeCodigo,
    unidade_nome: unidade.nome,
    resumo: collected.resumo,
    items: collected.rows.map((row) => ({
      unidade_codigo: row.unidade_codigo,
      emusys_fatura_id: row.emusys_fatura_id,
      emusys_matricula_id: row.emusys_matricula_id,
      emusys_contrato_id: row.emusys_contrato_id,
      emusys_student_id: row.emusys_student_id,
      descricao: row.descricao,
      status: row.status,
      data_vencimento: row.data_vencimento,
      data_pagamento: row.data_pagamento,
      valor_original: row.valor_original,
      valor_pago: row.valor_pago,
      juros_e_multa: row.juros_e_multa,
      desconto_aplicado: row.desconto_aplicado,
      desconto_condicional: row.desconto_condicional,
      validation_issues: row.validation_issues,
    })),
  };
}

async function processarQueueJob(
  supabase: ServiceClient,
  job: FinanceiroQueueJob,
  workerId: string,
): Promise<ProcessResult> {
  let syncRunId: string | null = null;

  try {
    syncRunId = String(await rpcOrThrow<string>(supabase, 'start_financeiro_sync_run', {
      p_competencia: job.competencia,
      p_trigger_source: job.trigger_source,
      p_requested_by: job.requested_by ?? 'queue_worker',
      p_stale_timeout_seconds: 1800,
    }));

    const limiter = new GlobalRateLimiter();
    const allRows: unknown[] = [];
    const unitsSummary: unknown[] = [];
    for (const [unidadeCodigo, unidade] of Object.entries(UNIDADES)) {
      const collected = await coletarFaturasUnidade({
        apiBaseUrl: EMUSYS_API,
        competencia: job.competencia,
        unidadeCodigo,
        unidade,
        limiter,
      });
      allRows.push(...collected.rows);
      unitsSummary.push(collected.resumo);
    }

    const publishedRun = await rpcOrThrow<Record<string, unknown>>(
      supabase,
      'publish_financeiro_sync_run',
      {
        p_run_id: syncRunId,
        p_items: allRows,
        p_units_summary: unitsSummary,
        p_override_reason: null,
      },
    );
    const completedJob = await rpcOrThrow<QueueRpcResult>(
      supabase,
      'complete_financeiro_sync_job',
      {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_sync_run_id: syncRunId,
      },
    );

    return {
      status: 200,
      body: {
        ok: true,
        queued: false,
        queue_status: completedJob.status ?? 'succeeded',
        next_attempt_at: null,
        sync_run_id: syncRunId,
        competencia: job.competencia,
        snapshot_complete: publishedRun.snapshot_complete === true,
        resultado: publishedRun,
        unidades: unitsSummary,
      },
    };
  } catch (error) {
    const classified = classifyFinanceiroSyncError(error);
    if (syncRunId) {
      const { error: failError } = await supabase.rpc('fail_financeiro_sync_run', {
        p_run_id: syncRunId,
        p_erro_detalhe: classified.detail,
      });
      if (failError) console.error('[sync-faturas-emusys] falha ao registrar run', failError);
    }

    console.error('[sync-faturas-emusys] falha do job', {
      job_id: job.id,
      competencia: job.competencia,
      code: classified.code,
      detail: classified.detail,
    });

    if (classified.retryable) {
      const retryJob = await rpcOrThrow<QueueRpcResult>(
        supabase,
        'retry_financeiro_sync_job',
        {
          p_job_id: job.id,
          p_worker_id: workerId,
          p_sync_run_id: syncRunId,
          p_error_code: classified.code,
          p_error_detail: classified.detail,
          p_http_status: classified.httpStatus,
          p_retry_after_seconds: classified.retryAfterSeconds,
        },
      );
      const retryWaiting = retryJob.status === 'retry_wait';
      return {
        status: retryWaiting ? 202 : 502,
        body: {
          ok: false,
          queued: retryWaiting,
          queue_status: retryJob.status ?? 'failed',
          next_attempt_at: retryJob.next_attempt_at ?? null,
          sync_run_id: syncRunId,
          competencia: job.competencia,
          erro_codigo: classified.code,
          erro: classified.detail,
        },
      };
    }

    const failedJob = await rpcOrThrow<QueueRpcResult>(supabase, 'fail_financeiro_sync_job', {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_sync_run_id: syncRunId,
      p_error_code: classified.code,
      p_error_detail: classified.detail,
    });
    return {
      status: classified.code === 'SYNC_VALIDATION_ERROR' ? 400 : 502,
      body: {
        ok: false,
        queued: false,
        queue_status: failedJob.status ?? 'failed',
        next_attempt_at: null,
        sync_run_id: syncRunId,
        competencia: job.competencia,
        erro_codigo: classified.code,
        erro: classified.detail,
      },
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'metodo nao permitido' }, 405);

  try {
    const access = await validarAcessoSync(req);
    if (access.denied) return access.denied;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const mode = String(body.mode ?? 'enqueue_and_work').trim().toLowerCase();
    if (!['enqueue_and_work', 'worker', 'probe'].includes(mode)) {
      return json({ ok: false, erro: 'mode invalido' }, 400);
    }

    if (mode === 'probe') {
      if (!access.isServiceRole) {
        return json({ ok: false, erro: 'probe exige service_role' }, 403);
      }
      const competencias = parseCompetencias(body);
      if (competencias.length !== 1) {
        return json({ ok: false, erro: 'probe exige uma competencia' }, 400);
      }
      const unidadeCodigo = String(body.unidade ?? '').trim().toLowerCase();
      if (!Object.hasOwn(UNIDADES, unidadeCodigo)) {
        return json({ ok: false, erro: 'probe exige unidade cg, recreio ou barra' }, 400);
      }
      return json({ ok: true, probe: true, ...(await executarProbe(competencias[0], unidadeCodigo)) });
    }

    if (mode === 'worker' && !access.isServiceRole) {
      return json({ ok: false, erro: 'worker exige service_role' }, 403);
    }
    if (body.unidade && String(body.unidade).toLowerCase() !== 'todos') {
      return json({ ok: false, erro: 'sync publicado exige sempre as 3 unidades' }, 400);
    }

    const overrideReason = String(body.override_reason ?? '').trim() || null;
    if (overrideReason) {
      return json({
        ok: false,
        erro: 'override de sanidade nao e aceito pela fila; corrija a divergencia na origem',
      }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const enqueues: QueueRpcResult[] = [];

    if (mode === 'enqueue_and_work') {
      const competencias = parseCompetencias(body);
      const includeBacklog = body.include_backlog === true || competencias.length === 0;
      if (competencias.length === 0 && !includeBacklog) {
        return json({ ok: false, erro: 'informe competencias ou include_backlog' }, 400);
      }
      const triggerSource = String(body.trigger_source ?? 'manual').trim() || 'manual';

      if (competencias.length > 0) {
        enqueues.push(await rpcOrThrow<QueueRpcResult>(
          supabase,
          'enqueue_financeiro_sync_competencias',
          {
            p_competencias: competencias,
            p_trigger_source: triggerSource,
            p_requested_by: access.requestedBy,
            p_priority: 50,
          },
        ));
      }
      if (includeBacklog) {
        enqueues.push(await rpcOrThrow<QueueRpcResult>(supabase, 'enqueue_financeiro_sync_backlog', {
          p_trigger_source: triggerSource,
          p_requested_by: access.requestedBy,
        }));
      }
    }

    const workerId = crypto.randomUUID();
    const claimedJob = await rpcOrThrow<FinanceiroQueueJob | null>(
      supabase,
      'claim_financeiro_sync_job',
      { p_worker_id: workerId, p_lease_seconds: 900 },
    );
    if (!claimedJob) {
      const queueState = queueStateFromEnqueues(enqueues);
      const idle = queueState.status === 'idle';
      return json({
        ok: idle,
        queued: !idle,
        queue_status: queueState.status,
        next_attempt_at: queueState.nextAttemptAt,
        sync_run_id: null,
        jobs: queueState.jobs,
      }, idle ? 200 : 202);
    }

    const result = await processarQueueJob(supabase, claimedJob, workerId);
    return json(result.body, result.status);
  } catch (error) {
    const message = syncErrorMessage(error);
    console.error('[sync-faturas-emusys] erro fora do job', error);
    const status = /competencia|ano invalido|mes invalido|no maximo 24/i.test(message) ? 400 : 500;
    return json({
      ok: false,
      queued: false,
      queue_status: 'error',
      next_attempt_at: null,
      sync_run_id: null,
      erro: message,
    }, status);
  }
});
