/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import {
  buildExportRows,
  buildManifest,
  validateCompetencia,
  type AlunoSource,
  type CursoSource,
  type FaturaSource,
} from '../_shared/contasReceberExport.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const INTERNAL_SECRET = Deno.env.get('SUPER_FOLHA_CONTAS_RECEBER_SECRET')?.trim() ?? '';
const PAGE_SIZE = 500;

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

async function fetchFaturas(client: SupabaseClient, competencia: string, syncRunId: string) {
  const rows: FaturaSource[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('sync_run_items')
      .select('id,canonical_fatura_id,run_id,unidade_id,unidade_codigo,emusys_fatura_id::text,emusys_matricula_id::text,emusys_student_id::text,descricao,status,data_vencimento,data_pagamento,competencia,valor_original,valor_pago,juros_e_multa,desconto_aplicado,desconto_fixo,desconto_condicional,source_missing,source_missing_reason,source_last_seen_at,source_missing_detected_at,source_missing_resolved_at')
      .eq('run_id', syncRunId)
      .eq('competencia', competencia)
      .order('unidade_id', { ascending: true })
      .order('emusys_fatura_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []).map((row) => ({
      ...row,
      sync_run_id: row.run_id,
    })) as FaturaSource[]));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  return rows;
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function fetchAlunos(client: SupabaseClient, faturas: FaturaSource[]) {
  const matriculas = [...new Set(faturas
    .map((row) => String(row.emusys_matricula_id ?? '').trim())
    .filter((value) => Boolean(value) && value !== '0'))];
  const students = [...new Set(faturas
    .map((row) => String(row.emusys_student_id ?? '').trim())
    .filter((value) => Boolean(value) && value !== '0'))];
  const unidades = [...new Set(faturas.map((row) => row.unidade_id))];
  const rowsById = new Map<number, AlunoSource>();
  for (const matriculaChunk of chunks(matriculas, 150)) {
    const { data, error } = await client
      .from('alunos')
      .select('id,nome,unidade_id,emusys_matricula_id,emusys_student_id,curso_id')
      .in('unidade_id', unidades)
      .in('emusys_matricula_id', matriculaChunk)
      .order('id', { ascending: true });
    if (error) throw error;
    for (const row of (data ?? []) as AlunoSource[]) rowsById.set(row.id, row);
  }
  for (const studentChunk of chunks(students, 150)) {
    const { data, error } = await client
      .from('alunos')
      .select('id,nome,unidade_id,emusys_matricula_id,emusys_student_id,curso_id')
      .in('unidade_id', unidades)
      .in('emusys_student_id', studentChunk)
      .order('id', { ascending: true });
    if (error) throw error;
    for (const row of (data ?? []) as AlunoSource[]) rowsById.set(row.id, row);
  }
  return [...rowsById.values()].sort((left, right) => left.id - right.id);
}

async function fetchCursos(client: SupabaseClient, alunos: AlunoSource[]) {
  const ids = [...new Set(alunos.map((row) => row.curso_id).filter((id): id is number => id != null))];
  const rows: CursoSource[] = [];
  for (const idChunk of chunks(ids, 200)) {
    const { data, error } = await client
      .from('cursos')
      .select('id,nome')
      .in('id', idChunk)
      .order('id', { ascending: true });
    if (error) throw error;
    rows.push(...((data ?? []) as CursoSource[]));
  }
  return rows;
}

async function fetchRun(client: SupabaseClient, competencia: string, syncRunId: string) {
  const { data, error } = await client
    .from('sync_runs')
    .select('id,competencia,run_type,status,completed_at,unidades_concluidas,snapshot_complete')
    .eq('id', syncRunId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('sync_run_id nao encontrado');
  if (data.competencia !== competencia) throw new Error('sync_run_id nao pertence a competencia solicitada');
  if (
    data.run_type !== 'live'
    || data.status !== 'succeeded'
    || data.snapshot_complete !== true
    || data.unidades_concluidas !== 3
    || !data.completed_at
  ) {
    throw new Error('sync_run_id nao representa snapshot live completo');
  }
  return data;
}

async function fetchLatestCompleteRun(client: SupabaseClient, competencia: string) {
  const { data, error } = await client
    .from('sync_runs')
    .select('id,competencia,run_type,status,completed_at,unidades_concluidas,snapshot_complete')
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
  if (!data) throw new Error('nenhum snapshot live completo encontrado para a competencia');
  return data;
}

async function readSnapshot(
  client: SupabaseClient,
  competencia: string,
  syncRunId: string | null,
  requireLatest: boolean,
) {
  const latestRun = await fetchLatestCompleteRun(client, competencia);
  const run = syncRunId ? await fetchRun(client, competencia, syncRunId) : latestRun;
  if (requireLatest && run.id !== latestRun.id) {
    throw new Error('run solicitado nao e o ultimo snapshot completo');
  }

  const faturas = await fetchFaturas(client, competencia, run.id);
  const alunos = await fetchAlunos(client, faturas);
  const cursos = await fetchCursos(client, alunos);
  const itens = await buildExportRows({ faturas, alunos, cursos });
  const latestAfterRead = await fetchLatestCompleteRun(client, competencia);
  if (requireLatest && run.id !== latestAfterRead.id) {
    throw new Error('run solicitado nao e o ultimo snapshot completo');
  }
  const manifesto = await buildManifest(competencia, itens, run, latestAfterRead.id);
  return { itens, manifesto };
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
    const competencia = validateCompetencia(body.competencia);
    const rawSyncRunId = String(body.sync_run_id ?? '').trim();
    const syncRunId = rawSyncRunId || null;
    if (syncRunId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(syncRunId)) {
      return json({ success: false, erro: 'sync_run_id deve ser UUID quando informado' }, 400);
    }
    if (body.require_latest != null && typeof body.require_latest !== 'boolean') {
      return json({ success: false, erro: 'require_latest deve ser boolean' }, 400);
    }
    const requireLatest = body.require_latest === true;
    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const snapshot = await readSnapshot(client, competencia, syncRunId, requireLatest);
    return json({ success: true, manifesto: snapshot.manifesto, itens: snapshot.itens });
  } catch (error) {
    console.error('[export-contas-receber]', error);
    const message = error instanceof Error
      ? error.message
      : (error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error));
    const status = /competencia|UUID quando informado|require_latest deve/i.test(message)
      ? 400
      : (/nao encontrado|nenhum snapshot/i.test(message)
        ? 404
        : (/snapshot live completo|ultimo snapshot completo/i.test(message) ? 409 : 500));
    return json({ success: false, erro: message }, status);
  }
});
