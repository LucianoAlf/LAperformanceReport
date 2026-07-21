/// <reference lib="deno.ns" />

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import {
  assertCatalogosDisjuntos,
  type DisciplinaCatalogo,
  hashPayloadAllowlist,
  parseDisciplinasCatalogo,
  parseProfessoresDisciplina,
  waitForRateLimit,
} from "../_shared/emusys-professor-disciplinas.ts";

const EMUSYS_BASE_URL = "https://api.emusys.com.br/v1";
const DISCIPLINAS_TURMA_PATH = "/disciplinas?tipo=turma";
const DISCIPLINAS_INDIVIDUAL_PATH = "/disciplinas?tipo=individual";
const MIN_REQUEST_INTERVAL_MS = 1_250;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 4;

const UNIDADES: ReadonlyMap<string, { nome: string; tokenEnv: string }> =
  new Map([
    [
      "2ec861f6-023f-4d7b-9927-3960ad8c2a92",
      { nome: "Campo Grande", tokenEnv: "EMUSYS_TOKEN_CG" },
    ],
    [
      "368d47f5-2d88-4475-bc14-ba084a9a348e",
      { nome: "Barra", tokenEnv: "EMUSYS_TOKEN_BARRA" },
    ],
    [
      "95553e96-971b-4590-a6eb-0201d013c14d",
      { nome: "Recreio", tokenEnv: "EMUSYS_TOKEN_RECREIO" },
    ],
  ]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sync-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SyncOrigin = "manual" | "cron";
type SyncMode = "diagnostico";

type SyncRequest = {
  unidade_id?: unknown;
  origem?: unknown;
  modo?: unknown;
};

type AuthorizedCaller = {
  origem: SyncOrigin;
  usuarioId: number | null;
};

class SyncError extends Error {
  constructor(
    readonly code: string,
    readonly status = 500,
    readonly stage = "sync",
  ) {
    super(code);
    this.name = "SyncError";
  }
}

function normalizeSyncError(error: unknown): SyncError {
  if (error instanceof SyncError) return error;
  if (error instanceof Error) {
    if (error.message === "DISCIPLINAS_EMUSYS_INVALIDAS") {
      return new SyncError(error.message, 502, "validacao_payload");
    }
    if (error.message === "PROFESSORES_EMUSYS_INVALIDOS") {
      return new SyncError(error.message, 502, "validacao_payload");
    }
    if (error.message.startsWith("DISCIPLINAS_MODALIDADE_CONFLITANTE:")) {
      return new SyncError(error.message, 409, "validacao_catalogo");
    }
  }
  return new SyncError("ERRO_INTERNO", 500);
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new SyncError(`ENV_AUSENTE_${name}`, 500, "configuracao");
  return value;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function constantTimeEquals(
  left: string,
  right: string,
): Promise<boolean> {
  if (!left || !right) return false;
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization")?.trim();
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  return header.slice("bearer ".length).trim() || null;
}

async function authorize(
  req: Request,
  unidadeId: string,
  requestedOrigin: SyncOrigin,
  adminClient: SupabaseClient,
): Promise<AuthorizedCaller> {
  const providedSyncToken = req.headers.get("x-sync-token")?.trim() ?? "";
  const configuredSyncToken = Deno.env.get("SYNC_PROFESSOR_DISCIPLINAS_TOKEN")
    ?.trim() ?? "";

  if (
    configuredSyncToken &&
    await constantTimeEquals(providedSyncToken, configuredSyncToken)
  ) {
    if (requestedOrigin !== "cron") {
      throw new SyncError(
        "ORIGEM_INCOMPATIVEL_COM_TOKEN_CRON",
        400,
        "autorizacao",
      );
    }
    return { origem: "cron", usuarioId: null };
  }

  const token = bearerToken(req);
  if (!token || requestedOrigin !== "manual") {
    throw new SyncError("NAO_AUTORIZADO", 401, "autorizacao");
  }

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const anonKey = requiredEnv("SUPABASE_ANON_KEY");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser(
    token,
  );
  if (authError || !authData.user) {
    throw new SyncError("NAO_AUTORIZADO", 401, "autorizacao");
  }

  const { data: allowed, error: permissionError } = await userClient.rpc(
    "fn_usuario_atual_tem_permissao",
    {
      p_codigo_permissao: "professores.editar",
      p_unidade_id: unidadeId,
    },
  );
  if (permissionError || allowed !== true) {
    throw new SyncError("ACESSO_NEGADO", 403, "autorizacao");
  }

  const { data: usuario, error: usuarioError } = await adminClient
    .from("usuarios")
    .select("id, ativo")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (usuarioError || !usuario?.id || usuario.ativo === false) {
    throw new SyncError("USUARIO_LOCAL_NAO_ENCONTRADO", 403, "autorizacao");
  }

  return { origem: "manual", usuarioId: Number(usuario.id) };
}

async function sleep(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchEmusysJson(params: {
  token: string;
  path: string;
  onAttempt: () => void;
}): Promise<unknown> {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    params.onAttempt();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${EMUSYS_BASE_URL}${params.path}`, {
        method: "GET",
        headers: { token: params.token, Accept: "application/json" },
        signal: controller.signal,
      });
      lastStatus = response.status;

      if (response.ok) {
        const result = await response.json();
        await waitForRateLimit(response.headers, MIN_REQUEST_INTERVAL_MS);
        return result;
      }

      if (response.status !== 429 && response.status < 500) {
        throw new SyncError(
          `EMUSYS_HTTP_${response.status}`,
          502,
          "consulta_emusys",
        );
      }

      await waitForRateLimit(
        response.headers,
        MIN_REQUEST_INTERVAL_MS * 2 ** (attempt - 1),
      );
    } catch (error) {
      if (error instanceof SyncError) throw error;
      if (attempt === MAX_ATTEMPTS) {
        throw new SyncError("EMUSYS_INDISPONIVEL", 502, "consulta_emusys");
      }
      await sleep(MIN_REQUEST_INTERVAL_MS * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new SyncError(`EMUSYS_HTTP_${lastStatus || "DESCONHECIDO"}`, 502);
}

async function createExecution(params: {
  client: SupabaseClient;
  unidadeId: string;
  caller: AuthorizedCaller;
  mode: SyncMode;
}): Promise<string> {
  const { data, error } = await params.client
    .from("emusys_professor_disciplinas_sync_execucoes")
    .insert({
      unidade_id: params.unidadeId,
      origem: params.caller.origem,
      status: "em_andamento",
      solicitado_por: params.caller.usuarioId,
      estatisticas: { modo: params.mode },
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    throw new SyncError("FALHA_CRIAR_EXECUCAO", 500, "persistencia");
  }
  return String(data.id);
}

async function updateExecution(
  client: SupabaseClient,
  executionId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await client
    .from("emusys_professor_disciplinas_sync_execucoes")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", executionId);
  if (error) {
    throw new SyncError("FALHA_ATUALIZAR_EXECUCAO", 500, "persistencia");
  }
}

async function upsertCatalog(
  client: SupabaseClient,
  executionId: string,
  unidadeId: string,
  disciplines: DisciplinaCatalogo[],
): Promise<void> {
  const now = new Date().toISOString();
  const rows = await Promise.all(
    disciplines.map(async (discipline) => ({
      unidade_id: unidadeId,
      emusys_disciplina_id: discipline.emusysDisciplinaId,
      nome_emusys: discipline.nomeEmusys,
      modalidade: discipline.modalidade,
      ativo_origem: true,
      ultimo_visto_em: now,
      sincronizado_em: now,
      ultima_execucao_id: executionId,
      payload_snapshot: discipline.payloadSnapshot,
      hash_payload: await hashPayloadAllowlist(discipline.payloadSnapshot),
      updated_at: now,
    })),
  );

  const { error } = await client
    .from("emusys_disciplinas_catalogo")
    .upsert(rows, { onConflict: "unidade_id,emusys_disciplina_id" });
  if (error) throw new SyncError("FALHA_UPSERT_CATALOGO", 500, "persistencia");
}

async function upsertProfessorAssignments(params: {
  client: SupabaseClient;
  executionId: string;
  unidadeId: string;
  discipline: DisciplinaCatalogo;
  payload: unknown;
}): Promise<number> {
  const professors = parseProfessoresDisciplina(params.payload);
  if (professors.length === 0) return 0;

  const now = new Date().toISOString();
  const rows = await Promise.all(
    professors.map(async (professor) => ({
      unidade_id: params.unidadeId,
      emusys_professor_id: professor.emusysProfessorId,
      emusys_disciplina_id: params.discipline.emusysDisciplinaId,
      ativo_origem: true,
      ultimo_visto_em: now,
      sincronizado_em: now,
      ultima_execucao_id: params.executionId,
      payload_snapshot: professor.payloadSnapshot,
      hash_payload: await hashPayloadAllowlist(professor.payloadSnapshot),
      updated_at: now,
    })),
  );

  const { error } = await params.client
    .from("emusys_professor_disciplinas")
    .upsert(rows, {
      onConflict: "unidade_id,emusys_professor_id,emusys_disciplina_id",
    });
  if (error) {
    throw new SyncError("FALHA_UPSERT_ATRIBUICOES", 500, "persistencia");
  }
  return rows.length;
}

async function markFailed(params: {
  client: SupabaseClient;
  executionId: string;
  error: unknown;
  requests: number;
  startedAt: number;
}): Promise<void> {
  const safeError = params.error instanceof SyncError
    ? { codigo: params.error.code, etapa: params.error.stage }
    : { codigo: "ERRO_INTERNO", etapa: "sync" };

  await updateExecution(params.client, params.executionId, {
    status: "falhou",
    finalizado_em: new Date().toISOString(),
    requisicoes: params.requests,
    falhas: [safeError],
    estatisticas: { duracao_ms: Date.now() - params.startedAt },
  });
}

async function runSync(params: {
  client: SupabaseClient;
  executionId: string;
  unidadeId: string;
  emusysToken: string;
  mode: SyncMode;
  startedAt: number;
}): Promise<Record<string, unknown>> {
  let requests = 0;
  let processed = 0;
  let assignments = 0;
  const countAttempt = () => {
    requests += 1;
  };

  try {
    const turmaPayload = await fetchEmusysJson({
      token: params.emusysToken,
      path: DISCIPLINAS_TURMA_PATH,
      onAttempt: countAttempt,
    });
    const individualPayload = await fetchEmusysJson({
      token: params.emusysToken,
      path: DISCIPLINAS_INDIVIDUAL_PATH,
      onAttempt: countAttempt,
    });
    const turma = parseDisciplinasCatalogo(turmaPayload, "turma");
    const individual = parseDisciplinasCatalogo(
      individualPayload,
      "individual",
    );
    assertCatalogosDisjuntos(turma, individual);
    const disciplines = [...turma, ...individual].sort((a, b) =>
      a.emusysDisciplinaId - b.emusysDisciplinaId
    );

    await updateExecution(params.client, params.executionId, {
      disciplinas_esperadas: disciplines.length,
      requisicoes: requests,
      estatisticas: {
        modo: params.mode,
        disciplinas_turma: turma.length,
        disciplinas_individual: individual.length,
      },
    });
    await upsertCatalog(
      params.client,
      params.executionId,
      params.unidadeId,
      disciplines,
    );

    for (const discipline of disciplines) {
      const professorPayload = await fetchEmusysJson({
        token: params.emusysToken,
        path: `/professores?curso_id=${discipline.emusysDisciplinaId}`,
        onAttempt: countAttempt,
      });
      assignments += await upsertProfessorAssignments({
        client: params.client,
        executionId: params.executionId,
        unidadeId: params.unidadeId,
        discipline,
        payload: professorPayload,
      });
      processed += 1;
      await updateExecution(params.client, params.executionId, {
        disciplinas_processadas: processed,
        requisicoes: requests,
        estatisticas: {
          modo: params.mode,
          disciplinas_turma: turma.length,
          disciplinas_individual: individual.length,
          atribuicoes_observadas: assignments,
        },
      });
    }

    const { data: finalized, error: finalizeError } = await params.client.rpc(
      "finalizar_sync_professor_disciplinas_emusys_v1",
      { p_execucao_id: params.executionId },
    );
    if (finalizeError) {
      throw new SyncError("FALHA_FINALIZAR_EXECUCAO", 500, "finalizacao");
    }

    return {
      sucesso: true,
      modo: params.mode,
      execucao_id: params.executionId,
      disciplinas: disciplines.length,
      disciplinas_turma: turma.length,
      disciplinas_individual: individual.length,
      atribuicoes: assignments,
      requisicoes: requests,
      duracao_ms: Date.now() - params.startedAt,
      finalizacao: finalized,
    };
  } catch (error) {
    const normalizedError = normalizeSyncError(error);
    try {
      await markFailed({
        client: params.client,
        executionId: params.executionId,
        error: normalizedError,
        requests,
        startedAt: params.startedAt,
      });
    } catch {
      // A falha original continua sendo a resposta; o operador recebe o ID da execucao.
    }
    throw normalizedError;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ erro: "METODO_NAO_PERMITIDO" }, 405);
  }

  const startedAt = Date.now();
  let executionId: string | null = null;

  try {
    let body: SyncRequest;
    try {
      body = await req.json() as SyncRequest;
    } catch {
      throw new SyncError("JSON_INVALIDO", 400, "validacao");
    }
    const unidadeId = typeof body.unidade_id === "string"
      ? body.unidade_id.trim()
      : "";
    const requestedOrigin = body.origem;
    const mode = body.modo;
    const unit = UNIDADES.get(unidadeId);

    if (!unit) throw new SyncError("UNIDADE_INVALIDA", 400, "validacao");
    if (requestedOrigin !== "manual" && requestedOrigin !== "cron") {
      throw new SyncError("ORIGEM_INVALIDA", 400, "validacao");
    }
    if (mode !== "diagnostico") {
      throw new SyncError("MODO_INVALIDO", 400, "validacao");
    }

    const adminClient = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const caller = await authorize(
      req,
      unidadeId,
      requestedOrigin,
      adminClient,
    );
    executionId = await createExecution({
      client: adminClient,
      unidadeId,
      caller,
      mode,
    });

    const result = await runSync({
      client: adminClient,
      executionId,
      unidadeId,
      emusysToken: requiredEnv(unit.tokenEnv),
      mode,
      startedAt,
    });
    return jsonResponse({ ...result, unidade: unit.nome });
  } catch (error) {
    const syncError = normalizeSyncError(error);
    return jsonResponse(
      {
        sucesso: false,
        erro: syncError.code,
        etapa: syncError.stage,
        execucao_id: executionId,
        duracao_ms: Date.now() - startedAt,
      },
      syncError.status,
    );
  }
});
