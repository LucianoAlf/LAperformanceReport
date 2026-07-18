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

async function fetchFaturas(client: SupabaseClient, competencia: string) {
  const rows: FaturaSource[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('emusys_faturas')
      .select('id,unidade_id,unidade_codigo,emusys_fatura_id::text,emusys_matricula_id::text,emusys_student_id::text,descricao,status,data_vencimento,data_pagamento,competencia,valor_original,valor_pago,juros_e_multa,desconto_aplicado,desconto_fixo,desconto_condicional,synced_at,updated_at')
      .eq('competencia', competencia)
      .order('unidade_id', { ascending: true })
      .order('emusys_fatura_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as FaturaSource[]));
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
    .filter(Boolean))];
  const unidades = [...new Set(faturas.map((row) => row.unidade_id))];
  const rows: AlunoSource[] = [];
  for (const matriculaChunk of chunks(matriculas, 150)) {
    const { data, error } = await client
      .from('alunos')
      .select('id,nome,unidade_id,emusys_matricula_id,curso_id')
      .in('unidade_id', unidades)
      .in('emusys_matricula_id', matriculaChunk)
      .order('id', { ascending: true });
    if (error) throw error;
    rows.push(...((data ?? []) as AlunoSource[]));
  }
  return rows;
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

async function readSnapshot(client: SupabaseClient, competencia: string) {
  const faturas = await fetchFaturas(client, competencia);
  const alunos = await fetchAlunos(client, faturas);
  const cursos = await fetchCursos(client, alunos);
  const itens = await buildExportRows({ faturas, alunos, cursos });
  const manifesto = await buildManifest(competencia, itens);
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
    const body = await request.json().catch(() => ({}));
    const competencia = validateCompetencia(body.competencia);
    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const first = await readSnapshot(client, competencia);
    const second = await readSnapshot(client, competencia);
    if (first.manifesto.manifest_hash !== second.manifesto.manifest_hash) {
      return json({
        success: false,
        erro: 'fonte mudou durante a leitura; tente o preflight novamente',
        manifest_hash_inicial: first.manifesto.manifest_hash,
        manifest_hash_final: second.manifesto.manifest_hash,
      }, 409);
    }

    return json({ success: true, manifesto: second.manifesto, itens: second.itens });
  } catch (error) {
    console.error('[export-contas-receber]', error);
    const message = error instanceof Error ? error.message : String(error);
    return json({ success: false, erro: message }, /competencia/i.test(message) ? 400 : 500);
  }
});
