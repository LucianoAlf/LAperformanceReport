/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buscarPaginaAulasEmusys,
  EmusysApiError,
  parseDataHoraEmusys,
} from '../_shared/emusys-aulas.ts';
import {
  devePausarAposCheckpoint,
} from '../_shared/checkpoint-historico-professor.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MIN_INTERVALO_MS = 1350;
const MAX_TENTATIVAS_API = 3;
const TIMEOUT_API_MS = 25_000;
const RETRY_AFTER_HEADER = 'Retry-After';

const UNIDADES: Record<string, { nome: string; tokenEnv: string }> = {
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': {
    nome: 'Campo Grande',
    tokenEnv: 'EMUSYS_TOKEN_CG',
  },
  '368d47f5-2d88-4475-bc14-ba084a9a348e': {
    nome: 'Barra',
    tokenEnv: 'EMUSYS_TOKEN_BARRA',
  },
  '95553e96-971b-4590-a6eb-0201d013c14d': {
    nome: 'Recreio',
    tokenEnv: 'EMUSYS_TOKEN_RECREIO',
  },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type JsonRecord = Record<string, unknown>;

interface ExecucaoBackfill {
  id: string;
  unidade_id: string;
  data_inicio: string;
  data_fim: string;
  janela_inicio_atual: string;
  janela_fim_atual: string;
  cursor_atual: string | null;
  status: 'pendente' | 'executando' | 'pausado' | 'concluido' | 'falhou';
  paginas_processadas: number;
  aulas_recebidas: number;
  requisicoes_realizadas: number;
  tentativas: number;
}

interface AulaNormalizada {
  emusys_aula_id: number;
  data_hora_inicio: string | null;
  data_hora_inicio_original: string | null;
  categoria: string | null;
  cancelada: boolean;
  reagendada: boolean;
  justificada: boolean;
  emusys_turma_id: number | null;
  turma_nome: string | null;
  emusys_disciplina_id: number | null;
  disciplina_nome: string | null;
  emusys_professor_id: number | null;
  professor_nome: string | null;
  sem_acompanhamento: boolean;
  payload: unknown;
  payload_hash: string;
  alunos: Array<{
    emusys_aluno_id: number | null;
    aluno_id: null;
    aluno_nome_origem: string | null;
    emusys_matricula_id: number | null;
    emusys_matricula_disciplina_id: number | null;
    presenca_origem: string | null;
    justificada_origem: boolean | null;
    linha_hash: string;
    payload: unknown;
  }>;
}

class BackfillError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    readonly pausavel = false,
    readonly tentativas = 0,
  ) {
    super(code);
    this.name = 'BackfillError';
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function numeroOuNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textoOuNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

function dataHoraOuNull(value: unknown): string | null {
  const text = textoOuNull(value);
  return text ? parseDataHoraEmusys(text) : null;
}

function ordenarJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordenarJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, ordenarJson(child)]),
    );
  }
  return value;
}

function serializarEstavel(value: unknown): string {
  return JSON.stringify(ordenarJson(value));
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(serializarEstavel(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function normalizarAulas(items: JsonRecord[]): Promise<AulaNormalizada[]> {
  const grupos = new Map<number, JsonRecord[]>();

  for (const item of items) {
    const id = numeroOuNull(item.id);
    if (id === null) throw new BackfillError('EMUSYS_AULA_SEM_ID', 502);
    const grupo = grupos.get(id) ?? [];
    grupo.push(item);
    grupos.set(id, grupo);
  }

  const resultado: AulaNormalizada[] = [];
  for (const [emusysAulaId, grupoOriginal] of grupos) {
    const grupo = [...grupoOriginal].sort((a, b) =>
      serializarEstavel(a).localeCompare(serializarEstavel(b))
    );
    const base = grupo[0];
    const payload = grupo.length === 1 ? base : { itens_origem: grupo };
    const professores = Array.isArray(base.professores)
      ? base.professores as JsonRecord[]
      : [];
    const professor = professores[0] ?? {};
    const emusysProfessorId = numeroOuNull(professor.id);
    const alunosBrutos = grupo.flatMap((item) =>
      Array.isArray(item.alunos) ? item.alunos as JsonRecord[] : []
    );
    const alunosPorHash = new Map<string, AulaNormalizada['alunos'][number]>();

    for (const aluno of alunosBrutos) {
      const linhaHash = await sha256(aluno);
      if (alunosPorHash.has(linhaHash)) continue;
      alunosPorHash.set(linhaHash, {
        emusys_aluno_id: numeroOuNull(aluno.id_aluno ?? aluno.aluno_id ?? aluno.id),
        aluno_id: null,
        aluno_nome_origem: textoOuNull(aluno.nome_aluno ?? aluno.nome),
        emusys_matricula_id: numeroOuNull(
          aluno.matricula_id ?? base.matricula_id,
        ),
        emusys_matricula_disciplina_id: numeroOuNull(
          aluno.matricula_disciplina_id ?? base.matricula_disciplina_id,
        ),
        presenca_origem: textoOuNull(aluno.presenca),
        justificada_origem:
          typeof aluno.justificada === 'boolean' ? aluno.justificada : null,
        linha_hash: linhaHash,
        payload: aluno,
      });
    }

    resultado.push({
      emusys_aula_id: emusysAulaId,
      data_hora_inicio: dataHoraOuNull(base.data_hora_inicio),
      data_hora_inicio_original:
        dataHoraOuNull(base.data_hora_inicio_original) ??
        dataHoraOuNull(base.data_hora_inicio),
      categoria: textoOuNull(base.categoria),
      cancelada: base.cancelada === true,
      reagendada: base.reagendada === true,
      justificada: base.justificada === true,
      emusys_turma_id: numeroOuNull(base.turma_id),
      turma_nome: textoOuNull(base.turma_nome),
      emusys_disciplina_id: numeroOuNull(base.disciplina_id ?? base.curso_id),
      disciplina_nome: textoOuNull(base.disciplina_nome ?? base.curso_nome),
      emusys_professor_id: emusysProfessorId,
      professor_nome: textoOuNull(professor.nome),
      sem_acompanhamento: emusysProfessorId === 0,
      payload,
      payload_hash: await sha256(payload),
      alunos: [...alunosPorHash.values()],
    });
  }

  return resultado.sort((a, b) => a.emusys_aula_id - b.emusys_aula_id);
}

function tokenDaUnidade(unidadeId: string): string {
  const unidade = UNIDADES[unidadeId];
  if (!unidade) throw new BackfillError('UNIDADE_NAO_CONFIGURADA', 400);
  const token = Deno.env.get(unidade.tokenEnv)?.trim();
  if (!token) throw new BackfillError('TOKEN_EMUSYS_AUSENTE', 500);
  return token;
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

async function autorizar(
  req: Request,
  adminClient: SupabaseClient,
): Promise<{ tipo: 'service_role' | 'admin'; usuarioId: number | null }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new BackfillError('NAO_AUTORIZADO', 401);
  }

  const bearerToken = authHeader.slice('Bearer '.length).trim();
  // verify_jwt valida a assinatura antes desta checagem; o claim cobre chaves
  // service_role validas mesmo quando a variavel reservada aponta outra geracao.
  if (
    bearerToken === SUPABASE_SERVICE_ROLE_KEY ||
    roleDoJwt(bearerToken) === 'service_role'
  ) {
    return { tipo: 'service_role', usuarioId: null };
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) throw new BackfillError('NAO_AUTORIZADO', 401);

  const { data: usuario, error: usuarioError } = await adminClient
    .from('usuarios')
    .select('id, perfil, ativo')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (usuarioError || !usuario || usuario.perfil !== 'admin' || usuario.ativo !== true) {
    throw new BackfillError('ACESSO_NEGADO', 403);
  }

  return { tipo: 'admin', usuarioId: Number(usuario.id) };
}

function parseRetryAfter(value: string | null): number {
  if (!value) return MIN_INTERVALO_MS;
  const segundos = Number(value);
  if (Number.isFinite(segundos)) return Math.max(MIN_INTERVALO_MS, segundos * 1000);
  const data = Date.parse(value);
  return Number.isFinite(data)
    ? Math.max(MIN_INTERVALO_MS, data - Date.now())
    : MIN_INTERVALO_MS;
}

async function buscarPaginaComRetry(params: {
  token: string;
  dataInicio: string;
  dataFim: string;
  cursor: string | null;
}): Promise<{
  items: JsonRecord[];
  paginacao: { tem_mais?: boolean; proximo_cursor?: string | null };
  requisicoes: number;
}> {
  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_API; tentativa += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_API_MS);
    try {
      const pagina = await buscarPaginaAulasEmusys<JsonRecord>({
        ...params,
        limite: 100,
        signal: controller.signal,
      });
      return { ...pagina, requisicoes: tentativa };
    } catch (error) {
      ultimoErro = error;
      const status = error instanceof EmusysApiError ? error.status : 0;
      if (status === 401 || status === 403) {
        throw new BackfillError('EMUSYS_TOKEN_REJEITADO', 502, false, tentativa);
      }

      const transitorio = status === 429 || status >= 500 || status === 0;
      if (!transitorio || tentativa === MAX_TENTATIVAS_API) break;

      const espera = error instanceof EmusysApiError && status === 429
        ? parseRetryAfter(error.retryAfter)
        : MIN_INTERVALO_MS + Math.floor(Math.random() * 350);
      await delay(espera);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const status = ultimoErro instanceof EmusysApiError ? ultimoErro.status : 0;
  throw new BackfillError(
    status === 429 ? 'EMUSYS_RATE_LIMIT' : 'EMUSYS_INDISPONIVEL',
    status === 429 ? 429 : 503,
    true,
    MAX_TENTATIVAS_API,
  );
}

function adicionarDia(dataIso: string): string {
  const date = new Date(`${dataIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function fimDoMesLimitado(dataIso: string, limiteIso: string): string {
  const date = new Date(`${dataIso}T12:00:00Z`);
  const fimMes = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  const fimMesIso = fimMes.toISOString().slice(0, 10);
  return fimMesIso < limiteIso ? fimMesIso : limiteIso;
}

function proximaJanela(execucao: ExecucaoBackfill): {
  inicio: string | null;
  fim: string | null;
} {
  if (execucao.janela_fim_atual >= execucao.data_fim) {
    return { inicio: null, fim: null };
  }
  const inicio = adicionarDia(execucao.janela_fim_atual);
  return { inicio, fim: fimDoMesLimitado(inicio, execucao.data_fim) };
}

async function carregarExecucao(
  adminClient: SupabaseClient,
  execucaoId: string,
): Promise<ExecucaoBackfill> {
  const { data, error } = await adminClient
    .from('emusys_historico_backfill_execucoes_v1')
    .select('*')
    .eq('id', execucaoId)
    .single();
  if (error || !data) throw new BackfillError('EXECUCAO_NAO_ENCONTRADA', 404);
  return data as ExecucaoBackfill;
}

async function iniciarSePendente(
  adminClient: SupabaseClient,
  execucao: ExecucaoBackfill,
): Promise<ExecucaoBackfill> {
  if (execucao.status !== 'pendente') return execucao;
  const { data, error } = await adminClient
    .from('emusys_historico_backfill_execucoes_v1')
    .update({ status: 'executando', iniciado_em: new Date().toISOString() })
    .eq('id', execucao.id)
    .eq('status', 'pendente')
    .select('*')
    .single();
  if (error || !data) throw new BackfillError('EXECUCAO_NAO_INICIADA', 409);
  return data as ExecucaoBackfill;
}

async function registrarErro(
  adminClient: SupabaseClient,
  execucao: ExecucaoBackfill,
  error: BackfillError,
): Promise<void> {
  if (error.code === 'BACKFILL_CHECKPOINT_DIVERGENTE') return;
  await adminClient
    .from('emusys_historico_backfill_execucoes_v1')
    .update({
      status: error.pausavel ? 'pausado' : 'falhou',
      tentativas: execucao.tentativas + error.tentativas,
      ultimo_erro_codigo: error.code,
      ultimo_erro_contexto: {
        janela_inicio: execucao.janela_inicio_atual,
        janela_fim: execucao.janela_fim_atual,
        http_status: error.httpStatus,
        retry_header: RETRY_AFTER_HEADER,
      },
      ultimo_erro_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', execucao.id);
}

function validarDataCorte(value: unknown, execucao: ExecucaoBackfill): string | null {
  if (value === null || value === undefined || value === '') return null;
  const data = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new BackfillError('PAUSA_DATA_INVALIDA', 400);
  }
  const parsed = new Date(`${data}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== data) {
    throw new BackfillError('PAUSA_DATA_INVALIDA', 400);
  }
  if (data < execucao.data_inicio || data > execucao.data_fim) {
    throw new BackfillError('PAUSA_FORA_DA_EXECUCAO', 400);
  }
  return data;
}

async function pausarNoCheckpoint(
  adminClient: SupabaseClient,
  execucao: ExecucaoBackfill,
): Promise<ExecucaoBackfill> {
  const { data, error } = await adminClient
    .from('emusys_historico_backfill_execucoes_v1')
    .update({ status: 'pausado', atualizado_em: new Date().toISOString() })
    .eq('id', execucao.id)
    .eq('status', 'executando')
    .select('*')
    .single();
  if (error || !data) throw new BackfillError('BACKFILL_PAUSA_FALHOU', 409);
  return data as ExecucaoBackfill;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'METODO_NAO_PERMITIDO' }, 405);

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let execucao: ExecucaoBackfill | null = null;

  try {
    await autorizar(req, adminClient);
    const body = await req.json() as {
      execucao_id?: string;
      max_paginas?: number;
      pausar_apos_data?: string;
    };
    if (!body.execucao_id) throw new BackfillError('EXECUCAO_ID_OBRIGATORIO', 400);
    const maxPaginas = Math.max(1, Math.min(Number(body.max_paginas ?? 1), 10));

    execucao = await carregarExecucao(adminClient, body.execucao_id);
    if (execucao.status === 'concluido') {
      return jsonResponse({ success: true, execucao });
    }
    if (execucao.status === 'pausado' || execucao.status === 'falhou') {
      throw new BackfillError('EXECUCAO_REQUER_RETOMADA', 409);
    }
    execucao = await iniciarSePendente(adminClient, execucao);
    const pausarAposData = validarDataCorte(body.pausar_apos_data, execucao);
    if (devePausarAposCheckpoint(execucao, pausarAposData)) {
      execucao = await pausarNoCheckpoint(adminClient, execucao);
      return jsonResponse({ success: true, execucao });
    }
    const token = tokenDaUnidade(execucao.unidade_id);

    for (let pagina = 0; pagina < maxPaginas; pagina += 1) {
      const checkpoint = { ...execucao };
      const resposta = await buscarPaginaComRetry({
        token,
        dataInicio: checkpoint.janela_inicio_atual,
        dataFim: checkpoint.janela_fim_atual,
        cursor: checkpoint.cursor_atual,
      });
      const aulas = await normalizarAulas(resposta.items);
      const temMais = resposta.paginacao?.tem_mais === true;
      const proximoCursor = resposta.paginacao?.proximo_cursor ?? null;
      const janelaSeguinte = temMais
        ? { inicio: null, fim: null }
        : proximaJanela(checkpoint);

      const { data, error } = await adminClient
        .rpc('registrar_pagina_backfill_historico_professor_v1', {
          p_execucao_id: checkpoint.id,
          p_janela_inicio: checkpoint.janela_inicio_atual,
          p_janela_fim: checkpoint.janela_fim_atual,
          p_cursor_esperado: checkpoint.cursor_atual,
          p_aulas: aulas,
          p_proximo_cursor: proximoCursor,
          p_tem_mais: temMais,
          p_proxima_janela_inicio: janelaSeguinte.inicio,
          p_proxima_janela_fim: janelaSeguinte.fim,
          p_requisicoes_realizadas: resposta.requisicoes,
        });

      if (error) {
        const code = error.message?.includes('BACKFILL_CHECKPOINT_DIVERGENTE')
          ? 'BACKFILL_CHECKPOINT_DIVERGENTE'
          : 'STAGING_TRANSACAO_FALHOU';
        throw new BackfillError(code, code.endsWith('DIVERGENTE') ? 409 : 500);
      }

      execucao = {
        ...checkpoint,
        ...data,
        id: data.execucao_id ?? checkpoint.id,
      } as ExecucaoBackfill;
      if (execucao.status === 'concluido') break;
      if (devePausarAposCheckpoint(execucao, pausarAposData)) {
        execucao = await pausarNoCheckpoint(adminClient, execucao);
        break;
      }
      if (pagina + 1 < maxPaginas) await delay(MIN_INTERVALO_MS);
    }

    return jsonResponse({ success: true, execucao });
  } catch (error) {
    const safeError = error instanceof BackfillError
      ? error
      : new BackfillError('ERRO_INTERNO', 500);
    if (execucao) await registrarErro(adminClient, execucao, safeError);
    console.error(`[backfill-historico-professor] ${safeError.code}`);
    return jsonResponse({ error: safeError.code }, safeError.httpStatus);
  }
});
