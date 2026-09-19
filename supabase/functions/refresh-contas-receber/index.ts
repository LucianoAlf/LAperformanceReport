/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import {
  activeQueuePayload,
  currentCompetenciaSaoPaulo,
  freshSnapshotPayload,
  isFreshCompleteSnapshot,
  resolveIncludeBacklog,
  type FinanceiroActiveQueueJob,
  type FinanceiroSyncRunSnapshot,
} from '../_shared/refreshContasReceber.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const INTERNAL_SECRET = Deno.env.get('SUPER_FOLHA_CONTAS_RECEBER_SECRET')?.trim() ?? '';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

function safeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
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

function namedCompetencia(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!['atual', 'anterior', 'seguinte'].includes(normalized)) return validateCompetencia(value);
  const current = currentCompetenciaSaoPaulo();
  const date = new Date(`${current}T00:00:00Z`);
  if (normalized === 'anterior') date.setUTCMonth(date.getUTCMonth() - 1);
  if (normalized === 'seguinte') date.setUTCMonth(date.getUTCMonth() + 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function parseCompetencias(body: Record<string, unknown>) {
  const requested = Array.isArray(body.competencias)
    ? body.competencias
    : (body.competencia != null ? [body.competencia] : []);
  if (requested.length > 24) throw new Error('informe no maximo 24 competencias');
  return [...new Set(requested.map(namedCompetencia))].sort();
}

async function fetchFreshCompleteSnapshot(client: SupabaseClient, competencia: string) {
  const { data, error } = await client
    .from('sync_runs')
    .select('id,competencia,run_type,status,completed_at,stale_after,unidades_concluidas,units_summary,snapshot_complete,total_emusys,total_inseridos,total_atualizados,total_ausentes_marcados')
    .eq('competencia', competencia)
    .eq('run_type', 'live')
    .eq('status', 'succeeded')
    .eq('snapshot_complete', true)
    .eq('unidades_concluidas', 3)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const run = data as FinanceiroSyncRunSnapshot | null;
  return isFreshCompleteSnapshot(run, new Date()) ? run : null;
}

async function fetchActiveQueueJob(client: SupabaseClient, competencia: string) {
  const { data, error } = await client
    .from('financeiro_sync_queue')
    .select('id,competencia,status,priority,attempt_count,max_attempts,next_attempt_at')
    .eq('competencia', competencia)
    .in('status', ['pending', 'running', 'retry_wait'])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as FinanceiroActiveQueueJob | null;
}

serve(async (request) => {
  if (request.method !== 'POST') return json({ success: false, erro: 'metodo nao permitido' }, 405);
  if (!INTERNAL_SECRET) return json({ success: false, erro: 'segredo interno nao configurado' }, 503);
  const supplied = request.headers.get('x-super-folha-sync-secret')?.trim() ?? '';
  if (!supplied || !safeEqual(supplied, INTERNAL_SECRET)) {
    return json({ success: false, erro: 'acesso negado' }, 403);
  }

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const competencias = parseCompetencias(body);
    const includeBacklog = resolveIncludeBacklog(body.include_backlog, competencias);
    if (competencias.length === 0 && !includeBacklog) {
      return json({ success: false, erro: 'informe competencias ou include_backlog' }, 400);
    }

    if (competencias.length === 1) {
      const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const freshRun = await fetchFreshCompleteSnapshot(client, competencias[0]);
      if (freshRun) return json({ ...freshSnapshotPayload(freshRun), success: true });

      const activeJob = await fetchActiveQueueJob(client, competencias[0]);
      if (activeJob) {
        return json({
          ...activeQueuePayload(activeJob),
          success: true,
          snapshot_complete: false,
        }, 202);
      }
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-faturas-emusys`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'enqueue_and_work',
        competencias,
        include_backlog: includeBacklog,
        trigger_source: 'internal_refresh',
      }),
    });
    const payload = await response.json().catch(() => ({ erro: `HTTP ${response.status}` })) as Record<string, unknown>;
    const success = response.ok && payload.ok === true;

    return json({
      ...payload,
      success,
      queue_status: payload.queue_status ?? 'error',
      next_attempt_at: payload.next_attempt_at ?? null,
      sync_run_id: payload.sync_run_id ?? null,
      snapshot_complete: payload.snapshot_complete === true,
    }, response.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[refresh-contas-receber]', error);
    return json({
      success: false,
      queue_status: 'error',
      next_attempt_at: null,
      sync_run_id: null,
      erro: message,
    }, /competencia|no maximo 24/i.test(message) ? 400 : 500);
  }
});
