/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  execucaoCobreRecorte,
} from '../_shared/checkpoint-historico-professor.mjs';
import {
  validarParticionamento,
} from '../_shared/reconstrucao-particionada-professor.mjs';
import {
  coletarIdsEmusysProfessores,
  reconstruirPeriodos,
  resolverProfessoresNoContexto,
} from '../_shared/reconstrucao-periodos-professor.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PAGE_SIZE = 700;

const UNIDADES = new Set([
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92', // Campo Grande
  '368d47f5-2d88-4475-bc14-ba084a9a348e', // Barra
  '95553e96-971b-4590-a6eb-0201d013c14d', // Recreio
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type JsonRecord = Record<string, unknown>;

interface RebuildInput {
  unidade_id?: string;
  data_inicio?: string;
  data_fim?: string;
  versao_reconstrucao?: string;
  manifesto_versao_fonte?: string | null;
  execucao_backfill_id?: string | null;
  inicio_completo?: boolean;
  evidencia_inicio_completo?: string | null;
  particao_total?: number | null;
  particao_indice?: number | null;
}

interface ValidatedInput {
  unidade_id: string;
  data_inicio: string;
  data_fim: string;
  versao_reconstrucao: string;
  manifesto_versao_fonte: string;
  execucao_backfill_id: string | null;
  inicio_completo: boolean;
  evidencia_inicio_completo: string | null;
  particao_total: number | null;
  particao_indice: number | null;
}

interface AulaStaging {
  id: number;
  unidade_id: string;
  emusys_aula_id: number;
  data_hora_inicio: string | null;
  cancelada: boolean;
  categoria: string | null;
  sem_acompanhamento: boolean;
  emusys_disciplina_id: number | null;
  emusys_professor_id: number | null;
  payload_hash: string;
}

interface RosterStaging {
  aula_staging_id: number;
  unidade_id: string;
  emusys_aula_id: number;
  emusys_aluno_id: number | null;
  aluno_id: number | null;
  emusys_matricula_id: number | null;
  emusys_matricula_disciplina_id: number | null;
  linha_hash: string;
}

interface EventoStagingParticionado {
  aula_staging_id: number;
  unidade_id: string;
  emusys_aula_id: number;
  data_hora_inicio: string | null;
  cancelada: boolean;
  categoria: string | null;
  sem_acompanhamento: boolean;
  emusys_disciplina_id: number | null;
  emusys_professor_id: number | null;
  payload_hash: string;
  emusys_aluno_id: number | null;
  aluno_id: number | null;
  pessoa_chave: string | null;
  emusys_matricula_id: number | null;
  emusys_matricula_disciplina_id: number | null;
  linha_hash: string;
}

class ReconstructionError extends Error {
  constructor(readonly code: string, readonly httpStatus: number) {
    super(code);
    this.name = 'ReconstructionError';
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function uniqueNumbers(values: Array<number | null | undefined>): number[] {
  return [...new Set(values.filter((value): value is number =>
    value !== null && value !== undefined && Number.isFinite(Number(value))
  ).map(Number))];
}

function nextDay(dateIso: string): string {
  const date = new Date(`${dateIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) {
    const canonicos = value.map(stable);
    return canonicos.sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right))
    );
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(stable(value)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function validarData(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ReconstructionError(`${field.toUpperCase()}_INVALIDA`, 400);
  }
  const parsed = Date.parse(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed)) {
    throw new ReconstructionError(`${field.toUpperCase()}_INVALIDA`, 400);
  }
  return value;
}

function roleDoJwt(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const claims = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof claims.role === 'string' ? claims.role : null;
  } catch {
    return null;
  }
}

function validarInput(body: RebuildInput): ValidatedInput {
  const unidadeId = String(body.unidade_id ?? '');
  if (!UNIDADES.has(unidadeId)) throw new ReconstructionError('UNIDADE_INVALIDA', 400);
  const dataInicio = validarData(body.data_inicio, 'data_inicio');
  const dataFim = validarData(body.data_fim, 'data_fim');
  if (dataFim < dataInicio) throw new ReconstructionError('RECORTE_INVALIDO', 400);
  const versao = String(body.versao_reconstrucao ?? '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(versao)) {
    throw new ReconstructionError('VERSAO_RECONSTRUCAO_INVALIDA', 400);
  }
  const manifestoVersaoFonte = String(body.manifesto_versao_fonte ?? versao).trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(manifestoVersaoFonte)) {
    throw new ReconstructionError('MANIFESTO_VERSAO_FONTE_INVALIDA', 400);
  }
  const execucaoId = body.execucao_backfill_id === null || body.execucao_backfill_id === undefined
    ? null
    : String(body.execucao_backfill_id);
  if (execucaoId !== null && !/^[0-9a-f-]{36}$/i.test(execucaoId)) {
    throw new ReconstructionError('EXECUCAO_BACKFILL_INVALIDA', 400);
  }
  const informouTotal = body.particao_total !== null && body.particao_total !== undefined;
  const informouIndice = body.particao_indice !== null && body.particao_indice !== undefined;
  let particaoTotal: number | null = null;
  let particaoIndice: number | null = null;
  if (informouTotal || informouIndice) {
    if (!informouTotal || !informouIndice || execucaoId === null) {
      throw new ReconstructionError('PARTICIONAMENTO_INCOMPLETO', 400);
    }
    try {
      const particao = validarParticionamento(body.particao_total, body.particao_indice);
      particaoTotal = particao.total;
      particaoIndice = particao.indice;
    } catch (error) {
      const code = error instanceof Error ? error.message : 'PARTICIONAMENTO_INVALIDO';
      throw new ReconstructionError(code, 400);
    }
  }
  const inicioCompleto = body.inicio_completo === true;
  const evidenciaInicioCompleto = typeof body.evidencia_inicio_completo === 'string'
    ? body.evidencia_inicio_completo.trim()
    : '';
  if (inicioCompleto && evidenciaInicioCompleto.length < 12) {
    throw new ReconstructionError('INICIO_COMPLETO_EXIGE_EVIDENCIA', 400);
  }
  return {
    unidade_id: unidadeId,
    data_inicio: dataInicio,
    data_fim: dataFim,
    versao_reconstrucao: versao,
    manifesto_versao_fonte: manifestoVersaoFonte,
    execucao_backfill_id: execucaoId,
    inicio_completo: inicioCompleto,
    evidencia_inicio_completo: inicioCompleto ? evidenciaInicioCompleto : null,
    particao_total: particaoTotal,
    particao_indice: particaoIndice,
  };
}

async function autorizar(
  req: Request,
  adminClient: SupabaseClient,
): Promise<{ tipo: 'service_role' | 'admin'; usuarioId: number | null }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new ReconstructionError('NAO_AUTORIZADO', 401);
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (
    token === SUPABASE_SERVICE_ROLE_KEY ||
    roleDoJwt(token) === 'service_role'
  ) {
    return { tipo: 'service_role', usuarioId: null };
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) throw new ReconstructionError('NAO_AUTORIZADO', 401);
  const { data: usuario, error } = await adminClient
    .from('usuarios')
    .select('id, perfil, ativo')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (error || !usuario || usuario.ativo !== true || usuario.perfil !== 'admin') {
    throw new ReconstructionError('ACESSO_NEGADO', 403);
  }
  return { tipo: 'admin', usuarioId: Number(usuario.id) };
}

async function fetchAll<T>(factory: (from: number, to: number) => Promise<{
  data: T[] | null;
  error: { message?: string } | null;
}>): Promise<T[]> {
  const result: T[] = [];
  for (let from = 0;; from += PAGE_SIZE) {
    const { data, error } = await factory(from, from + PAGE_SIZE - 1);
    if (error) throw new ReconstructionError('LEITURA_STAGING_FALHOU', 500);
    const rows = data ?? [];
    result.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return result;
}

async function carregarAulas(
  adminClient: SupabaseClient,
  input: ValidatedInput,
): Promise<AulaStaging[]> {
  return fetchAll<AulaStaging>(async (from, to) => await adminClient
    .from('emusys_aulas_historico_staging_v1')
    .select('id, unidade_id, emusys_aula_id, data_hora_inicio, cancelada, categoria, sem_acompanhamento, emusys_disciplina_id, emusys_professor_id, payload_hash')
    .eq('unidade_id', input.unidade_id)
    .gte('data_hora_inicio', `${input.data_inicio}T00:00:00-03:00`)
    .lt('data_hora_inicio', `${nextDay(input.data_fim)}T00:00:00-03:00`)
    .order('data_hora_inicio', { ascending: true })
    .order('emusys_aula_id', { ascending: true })
    .range(from, to));
}

async function carregarEventosParticionados(
  adminClient: SupabaseClient,
  input: ValidatedInput,
): Promise<EventoStagingParticionado[]> {
  if (input.particao_total === null || input.particao_indice === null) {
    throw new ReconstructionError('PARTICIONAMENTO_INCOMPLETO', 400);
  }
  const { error: manifestoError } = await adminClient.rpc(
    'preparar_manifesto_reconstrucao_professor_v1',
    {
      p_unidade_id: input.unidade_id,
      p_data_inicio: input.data_inicio,
      p_data_fim: input.data_fim,
      p_versao_reconstrucao: input.manifesto_versao_fonte,
      p_execucao_backfill_id: input.execucao_backfill_id,
      p_total_particoes: input.particao_total,
    },
  );
  if (manifestoError) throw new ReconstructionError('PREPARO_MANIFESTO_FALHOU', 500);

  return fetchAll<EventoStagingParticionado>(async (from, to) => await adminClient
    .rpc('listar_eventos_staging_particao_professor_v1', {
      p_unidade_id: input.unidade_id,
      p_data_inicio: input.data_inicio,
      p_data_fim: input.data_fim,
      p_versao_reconstrucao: input.manifesto_versao_fonte,
      p_execucao_backfill_id: input.execucao_backfill_id,
      p_total_particoes: input.particao_total,
      p_particao_indice: input.particao_indice,
    })
    .range(from, to));
}

async function carregarRoster(
  adminClient: SupabaseClient,
  aulas: AulaStaging[],
): Promise<RosterStaging[]> {
  const result: RosterStaging[] = [];
  for (const ids of chunk(aulas.map((item) => item.id), 300)) {
    const rows = await fetchAll<RosterStaging>(async (from, to) => await adminClient
      .from('emusys_aula_alunos_historico_staging_v1')
      .select('aula_staging_id, unidade_id, emusys_aula_id, emusys_aluno_id, aluno_id, emusys_matricula_id, emusys_matricula_disciplina_id, linha_hash')
      .in('aula_staging_id', ids)
      .order('aula_staging_id', { ascending: true })
      .range(from, to));
    result.push(...rows);
  }
  return result;
}

async function carregarIdentidades(
  adminClient: SupabaseClient,
  unidadeId: string,
  alunoIds: number[],
): Promise<Map<number, { pessoa_chave: string; aluno_id_canonico: number }>> {
  const result = new Map<number, { pessoa_chave: string; aluno_id_canonico: number }>();
  for (const ids of chunk(alunoIds, 300)) {
    if (ids.length === 0) continue;
    const { data, error } = await adminClient
      .from('vw_aluno_identidade_unidade_canonica')
      .select('emusys_aluno_id, pessoa_chave, aluno_id_canonico')
      .eq('unidade_id', unidadeId)
      .in('emusys_aluno_id', ids);
    if (error) throw new ReconstructionError('IDENTIDADE_ALUNO_FALHOU', 500);
    for (const row of data ?? []) {
      result.set(Number(row.emusys_aluno_id), {
        pessoa_chave: String(row.pessoa_chave),
        aluno_id_canonico: Number(row.aluno_id_canonico),
      });
    }
  }
  return result;
}

async function carregarProfessores(
  adminClient: SupabaseClient,
  unidadeId: string,
  emusysIds: number[],
): Promise<Map<number, { professor_id: number | null; ambiguo: boolean }>> {
  const candidates = new Map<number, Set<number>>();
  for (const ids of chunk(emusysIds, 300)) {
    if (ids.length === 0) continue;
    const { data, error } = await adminClient
      .from('professores_unidades')
      .select(`
        professor_id,
        emusys_id,
        emusys_ativo,
        validacao_status,
        identidade_historica_valida,
        professores:professor_id (ativo)
      `)
      .eq('unidade_id', unidadeId)
      .in('emusys_id', ids);
    if (error) throw new ReconstructionError('IDENTIDADE_PROFESSOR_FALHOU', 500);
    for (const row of data ?? []) {
      const professor = Array.isArray(row.professores)
        ? row.professores[0]
        : row.professores;
      const vinculoOperacional = row.emusys_ativo === true
        && row.validacao_status !== 'ignorado'
        && professor?.ativo === true;
      const identidadeHistorica = row.identidade_historica_valida === true;
      if (!vinculoOperacional && !identidadeHistorica) continue;

      const emusysId = Number(row.emusys_id);
      const set = candidates.get(emusysId) ?? new Set<number>();
      set.add(Number(row.professor_id));
      candidates.set(emusysId, set);
    }
  }

  return new Map([...candidates.entries()].map(([emusysId, ids]) => [
    emusysId,
    { professor_id: ids.size === 1 ? [...ids][0] : null, ambiguo: ids.size > 1 },
  ]));
}

async function carregarCursos(
  adminClient: SupabaseClient,
  unidadeId: string,
  disciplinas: number[],
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  for (const ids of chunk(disciplinas, 300)) {
    if (ids.length === 0) continue;
    const { data, error } = await adminClient
      .from('curso_emusys_depara')
      .select('emusys_disciplina_id, curso_id')
      .eq('unidade_id', unidadeId)
      .in('emusys_disciplina_id', ids);
    if (error) throw new ReconstructionError('DEPARA_CURSO_FALHOU', 500);
    for (const row of data ?? []) {
      result.set(Number(row.emusys_disciplina_id), Number(row.curso_id));
    }
  }
  return result;
}

async function carregarContextoPedagogico(
  adminClient: SupabaseClient,
  unidadeId: string,
  matriculasDisciplinas: number[],
  alunosEmusys: number[],
): Promise<{
  jornadas: JsonRecord[];
  transicoes: JsonRecord[];
  alunos_emusys_contextualizados: number[];
}> {
  const jornadas: JsonRecord[] = [];
  const transicoes: JsonRecord[] = [];
  for (const ids of chunk(matriculasDisciplinas, 250)) {
    if (ids.length === 0) continue;
    const [jornadaResult, transicaoResult] = await Promise.all([
      adminClient
        .from('aluno_jornada_matricula_disciplina')
        .select('unidade_id, aluno_id, emusys_aluno_id, emusys_matricula_id, emusys_matricula_disciplina_id, emusys_disciplina_id, curso_id, professor_id, emusys_professor_id, status_matricula, data_primeira_aula, data_ultima_aula')
        .eq('unidade_id', unidadeId)
        .in('emusys_matricula_disciplina_id', ids),
      adminClient
        .from('aluno_professor_transicoes')
        .select('unidade_id, aluno_id, emusys_matricula_id, emusys_matricula_disciplina_id, professor_anterior_id, professor_novo_id, emusys_professor_anterior_id, emusys_professor_novo_id, data_transicao, tipo_transicao, fonte')
        .eq('unidade_id', unidadeId)
        .in('emusys_matricula_disciplina_id', ids),
    ]);
    if (jornadaResult.error || transicaoResult.error) {
      throw new ReconstructionError('CONTEXTO_PEDAGOGICO_FALHOU', 500);
    }
    jornadas.push(...(jornadaResult.data ?? []));
    transicoes.push(...(transicaoResult.data ?? []));
  }

  // IDs de matricula-disciplina mudam em renovacoes. Carregar todas as jornadas
  // da pessoa permite reconciliar o ID historico com a jornada atual.
  for (const ids of chunk(alunosEmusys, 250)) {
    if (ids.length === 0) continue;
    const { data, error } = await adminClient
      .from('aluno_jornada_matricula_disciplina')
      .select('unidade_id, aluno_id, emusys_aluno_id, emusys_matricula_id, emusys_matricula_disciplina_id, emusys_disciplina_id, curso_id, professor_id, emusys_professor_id, status_matricula, data_primeira_aula, data_ultima_aula')
      .eq('unidade_id', unidadeId)
      .in('emusys_aluno_id', ids);
    if (error) throw new ReconstructionError('CONTEXTO_PEDAGOGICO_FALHOU', 500);
    jornadas.push(...(data ?? []));
  }

  const jornadasUnicas = new Map<string, JsonRecord>();
  for (const jornada of jornadas) {
    const chave = [
      jornada.unidade_id,
      jornada.emusys_aluno_id,
      jornada.emusys_matricula_disciplina_id,
    ].join(':');
    jornadasUnicas.set(chave, jornada);
  }
  return {
    jornadas: [...jornadasUnicas.values()],
    transicoes,
    alunos_emusys_contextualizados: uniqueNumbers(alunosEmusys),
  };
}

async function validarExecucaoBackfill(
  adminClient: SupabaseClient,
  input: ValidatedInput,
): Promise<void> {
  if (!input.execucao_backfill_id) return;
  const { data, error } = await adminClient
    .from('emusys_historico_backfill_execucoes_v1')
    .select('id, unidade_id, data_inicio, data_fim, janela_inicio_atual, cursor_atual, status')
    .eq('id', input.execucao_backfill_id)
    .maybeSingle();
  if (error || !data || !execucaoCobreRecorte(data, input)) {
    throw new ReconstructionError('EXECUCAO_BACKFILL_INCOMPATIVEL', 409);
  }
}

async function processarParticao(
  adminClient: SupabaseClient,
  input: ValidatedInput,
): Promise<JsonRecord> {
  if (
    input.particao_total === null || input.particao_indice === null ||
    input.execucao_backfill_id === null
  ) {
    throw new ReconstructionError('PARTICIONAMENTO_INCOMPLETO', 400);
  }

  const linhas = await carregarEventosParticionados(adminClient, input);
  const matriculasDisciplinas = uniqueNumbers(
    linhas.map((item) => item.emusys_matricula_disciplina_id),
  );
  const contextoBruto = await carregarContextoPedagogico(
    adminClient,
    input.unidade_id,
    matriculasDisciplinas,
    uniqueNumbers(linhas.map((item) => item.emusys_aluno_id)),
  );
  const professores = await carregarProfessores(
    adminClient,
    input.unidade_id,
    coletarIdsEmusysProfessores(linhas, contextoBruto),
  );
  const contexto = resolverProfessoresNoContexto(
    contextoBruto,
    professores,
  ) as typeof contextoBruto;
  const cursos = await carregarCursos(
    adminClient,
    input.unidade_id,
    uniqueNumbers(linhas.map((item) => item.emusys_disciplina_id)),
  );
  const eventos = linhas.map((linha) => {
    const professor = linha.emusys_professor_id === null
      ? null
      : professores.get(Number(linha.emusys_professor_id)) ?? null;
    const disciplina = linha.emusys_disciplina_id === null
      ? null
      : Number(linha.emusys_disciplina_id);
    return {
      unidade_id: input.unidade_id,
      emusys_aula_id: Number(linha.emusys_aula_id),
      data_hora_inicio: linha.data_hora_inicio,
      cancelada: linha.cancelada,
      categoria: linha.categoria,
      sem_acompanhamento: linha.sem_acompanhamento,
      emusys_aluno_id: linha.emusys_aluno_id,
      aluno_id: linha.aluno_id,
      pessoa_chave: linha.pessoa_chave,
      emusys_matricula_id: linha.emusys_matricula_id,
      emusys_matricula_disciplina_id: linha.emusys_matricula_disciplina_id,
      emusys_disciplina_id: disciplina,
      curso_id: disciplina === null ? null : cursos.get(disciplina) ?? null,
      professor_id: professor?.professor_id ?? null,
      emusys_professor_id: linha.emusys_professor_id,
      professor_resolvido_por_id: professor?.professor_id !== null && professor?.ambiguo !== true,
      evidencia_hash: `${linha.payload_hash}:${linha.linha_hash}`,
    };
  });

  const entradaHash = await sha256({
    unidade_id: input.unidade_id,
    data_inicio: input.data_inicio,
    data_fim: input.data_fim,
    versao_reconstrucao: input.versao_reconstrucao,
    manifesto_versao_fonte: input.manifesto_versao_fonte,
    particao_total: input.particao_total,
    particao_indice: input.particao_indice,
    eventos: eventos.map((item) => ({
      aula: item.emusys_aula_id,
      pessoa: item.pessoa_chave,
      matricula: item.emusys_matricula_id,
      matricula_disciplina: item.emusys_matricula_disciplina_id,
      professor: item.emusys_professor_id,
      data: item.data_hora_inicio,
      hash: item.evidencia_hash,
    })),
    jornadas: contexto.jornadas,
    transicoes: contexto.transicoes,
    alunos_emusys_contextualizados: contexto.alunos_emusys_contextualizados,
    evidencia_inicio_completo: input.evidencia_inicio_completo,
  });
  const reconstruida = reconstruirPeriodos(eventos, {
    versao_reconstrucao: input.versao_reconstrucao,
    entrada_hash: entradaHash,
    data_inicio_recorte: input.data_inicio,
    data_fim_recorte: input.data_fim,
    inicio_completo: input.inicio_completo,
    evidencia_inicio_completo: input.evidencia_inicio_completo,
    jornadas_atuais: contexto.jornadas,
    transicoes: contexto.transicoes,
    alunos_emusys_contextualizados: contexto.alunos_emusys_contextualizados,
  });
  const periodos = reconstruida.periodos.map((periodo: JsonRecord) => ({
    ...periodo,
    entrada_hash: entradaHash,
  }));

  const { data: registro, error: registroError } = await adminClient.rpc(
    'registrar_particao_periodos_professor_v1',
    {
      p_unidade_id: input.unidade_id,
      p_data_inicio: input.data_inicio,
      p_data_fim: input.data_fim,
      p_versao_reconstrucao: input.versao_reconstrucao,
      p_execucao_backfill_id: input.execucao_backfill_id,
      p_total_particoes: input.particao_total,
      p_particao_indice: input.particao_indice,
      p_entrada_hash: entradaHash,
      p_periodos: periodos,
      p_diagnosticos: reconstruida.diagnosticos,
      p_total_eventos: reconstruida.total_eventos,
      p_total_particoes_logicas: reconstruida.total_particoes,
      p_parametros: {
        processamento_particionado: true,
        manifesto_versao_fonte: input.manifesto_versao_fonte,
        inicio_completo: input.inicio_completo,
        evidencia_inicio_completo: input.evidencia_inicio_completo,
        particao_total: input.particao_total,
        particao_indice: input.particao_indice,
        total_eventos_staging: linhas.length,
      },
    },
  );
  if (registroError) throw new ReconstructionError('REGISTRO_PARTICAO_FALHOU', 500);

  const { data: finalizacao, error: finalizacaoError } = await adminClient.rpc(
    'finalizar_reconstrucao_particionada_professor_v1',
    {
      p_unidade_id: input.unidade_id,
      p_data_inicio: input.data_inicio,
      p_data_fim: input.data_fim,
      p_versao_reconstrucao: input.versao_reconstrucao,
      p_execucao_backfill_id: input.execucao_backfill_id,
      p_total_particoes: input.particao_total,
      p_inicio_completo: input.inicio_completo,
    },
  );
  if (finalizacaoError) throw new ReconstructionError('FINALIZACAO_PARTICIONADA_FALHOU', 500);

  return {
    success: true,
    processamento_particionado: true,
    registro,
    finalizacao,
    resumo: {
      particao_indice: input.particao_indice,
      total_particoes: input.particao_total,
      eventos: reconstruida.total_eventos,
      particoes_logicas: reconstruida.total_particoes,
      periodos: periodos.length,
      diagnosticos: reconstruida.diagnosticos.length,
      entrada_hash: entradaHash,
    },
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'METODO_NAO_PERMITIDO' }, 405);

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    await autorizar(req, adminClient);
    const input = validarInput(await req.json() as RebuildInput);
    await validarExecucaoBackfill(adminClient, input);

    if (input.particao_total !== null) {
      return jsonResponse(await processarParticao(adminClient, input));
    }

    const aulas = await carregarAulas(adminClient, input);
    if (aulas.length === 0) throw new ReconstructionError('SEM_EVIDENCIA_STAGING', 422);
    const roster = await carregarRoster(adminClient, aulas);
    if (roster.length === 0) throw new ReconstructionError('SEM_ROSTER_STAGING', 422);

    const matriculasDisciplinas = uniqueNumbers(
      roster.map((item) => item.emusys_matricula_disciplina_id),
    );
    const contextoBruto = await carregarContextoPedagogico(
      adminClient,
      input.unidade_id,
      matriculasDisciplinas,
      uniqueNumbers(roster.map((item) => item.emusys_aluno_id)),
    );
    const identidades = await carregarIdentidades(
      adminClient,
      input.unidade_id,
      uniqueNumbers(roster.map((item) => item.emusys_aluno_id)),
    );
    const professores = await carregarProfessores(
      adminClient,
      input.unidade_id,
      coletarIdsEmusysProfessores(aulas, contextoBruto),
    );
    const contexto = resolverProfessoresNoContexto(
      contextoBruto,
      professores,
    ) as typeof contextoBruto;
    const cursos = await carregarCursos(
      adminClient,
      input.unidade_id,
      uniqueNumbers(aulas.map((item) => item.emusys_disciplina_id)),
    );
    const aulasPorId = new Map(aulas.map((item) => [item.id, item]));
    const eventos = roster.map((linha) => {
      const aula = aulasPorId.get(linha.aula_staging_id);
      if (!aula) throw new ReconstructionError('ROSTER_SEM_AULA_STAGING', 500);
      const identidade = linha.emusys_aluno_id === null
        ? null
        : identidades.get(Number(linha.emusys_aluno_id)) ?? null;
      const professor = aula.emusys_professor_id === null
        ? null
        : professores.get(Number(aula.emusys_professor_id)) ?? null;
      const disciplina = aula.emusys_disciplina_id === null
        ? null
        : Number(aula.emusys_disciplina_id);

      return {
        unidade_id: input.unidade_id,
        emusys_aula_id: Number(aula.emusys_aula_id),
        data_hora_inicio: aula.data_hora_inicio,
        cancelada: aula.cancelada,
        categoria: aula.categoria,
        sem_acompanhamento: aula.sem_acompanhamento,
        emusys_aluno_id: linha.emusys_aluno_id,
        aluno_id: identidade?.aluno_id_canonico ?? linha.aluno_id,
        pessoa_chave: identidade?.pessoa_chave ?? (
          linha.emusys_aluno_id === null ? null : `emusys:${linha.emusys_aluno_id}`
        ),
        emusys_matricula_id: linha.emusys_matricula_id,
        emusys_matricula_disciplina_id: linha.emusys_matricula_disciplina_id,
        emusys_disciplina_id: disciplina,
        curso_id: disciplina === null ? null : cursos.get(disciplina) ?? null,
        professor_id: professor?.professor_id ?? null,
        emusys_professor_id: aula.emusys_professor_id,
        professor_resolvido_por_id: professor?.professor_id !== null && professor?.ambiguo !== true,
        evidencia_hash: `${aula.payload_hash}:${linha.linha_hash}`,
      };
    });

    const entradaHash = await sha256({
      unidade_id: input.unidade_id,
      data_inicio: input.data_inicio,
      data_fim: input.data_fim,
      versao_reconstrucao: input.versao_reconstrucao,
      eventos: eventos.map((item) => ({
        aula: item.emusys_aula_id,
        pessoa: item.pessoa_chave,
        matricula: item.emusys_matricula_id,
        matricula_disciplina: item.emusys_matricula_disciplina_id,
        professor: item.emusys_professor_id,
        data: item.data_hora_inicio,
        hash: item.evidencia_hash,
      })),
      jornadas: contexto.jornadas,
      transicoes: contexto.transicoes,
      alunos_emusys_contextualizados: contexto.alunos_emusys_contextualizados,
      evidencia_inicio_completo: input.evidencia_inicio_completo,
    });

    const reconstruida = reconstruirPeriodos(eventos, {
      versao_reconstrucao: input.versao_reconstrucao,
      entrada_hash: entradaHash,
      data_inicio_recorte: input.data_inicio,
      data_fim_recorte: input.data_fim,
      inicio_completo: input.inicio_completo,
      evidencia_inicio_completo: input.evidencia_inicio_completo,
      jornadas_atuais: contexto.jornadas,
      transicoes: contexto.transicoes,
      alunos_emusys_contextualizados: contexto.alunos_emusys_contextualizados,
    });
    const periodos = reconstruida.periodos.map((periodo: JsonRecord) => ({
      ...periodo,
      entrada_hash: entradaHash,
    }));

    const { data, error } = await adminClient.rpc('materializar_periodos_professor_v1', {
      p_unidade_id: input.unidade_id,
      p_data_inicio: input.data_inicio,
      p_data_fim: input.data_fim,
      p_versao_reconstrucao: input.versao_reconstrucao,
      p_entrada_hash: entradaHash,
      p_periodos: periodos,
      p_diagnosticos: reconstruida.diagnosticos,
      p_execucao_backfill_id: input.execucao_backfill_id,
      p_total_eventos: reconstruida.total_eventos,
      p_parametros: {
        inicio_completo: input.inicio_completo,
        evidencia_inicio_completo: input.evidencia_inicio_completo,
        total_aulas_staging: aulas.length,
        total_roster_staging: roster.length,
        total_particoes: reconstruida.total_particoes,
        identidade_professor: 'professores_unidades.emusys_id+unidade_id',
        identidade_aluno: 'vw_aluno_identidade_unidade_canonica',
      },
    });
    if (error) throw new ReconstructionError('MATERIALIZACAO_FALHOU', 500);

    return jsonResponse({
      success: true,
      resultado: data,
      resumo: {
        aulas_staging: aulas.length,
        roster_staging: roster.length,
        eventos: reconstruida.total_eventos,
        particoes: reconstruida.total_particoes,
        periodos: periodos.length,
        diagnosticos: reconstruida.diagnosticos.length,
        entrada_hash: entradaHash,
      },
    });
  } catch (error) {
    const safe = error instanceof ReconstructionError
      ? error
      : new ReconstructionError('ERRO_INTERNO', 500);
    console.error(`[reconstruir-periodos-professor] ${safe.code}`);
    return jsonResponse({ error: safe.code }, safe.httpStatus);
  }
});
