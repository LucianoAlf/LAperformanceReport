// deno-lint-ignore-file no-import-prefix
/// <reference lib="deno.ns" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import {
  autenticarUsuarioAtivoUnico,
  type AuthAdapters,
  ErroAutorizacao,
  resolverAssinaturaAtivaParaNovaPreview,
} from "./auth.ts";
import {
  type DestinoPesquisa,
  hashPreview,
  mascararTelefone,
  renderizarMensagem,
  resolverDestinoPesquisaPorPublico,
  validarRequest,
} from "./contract.ts";
import {
  persistirOuConfirmarResultadoEnviado,
  prepararCapturaRespostaBestEffort,
  type ResultadoCapturaResposta,
} from "./flow.ts";
import {
  classificarRespostaProvider,
  deveAbrirConversaReal,
  enviarMensagemComCredenciaisExatas,
  ErroConfiguracaoProvider,
  type EstadoEnvioPersistido,
  sanitizarErroProvider,
} from "./provider.ts";
import { resolverPublicoPesquisa } from "./publico.ts";

const CAIXA_SUCESSO_ID = 3;
const PREVIEW_TTL_MS = 10 * 60 * 1000;
const CONVERSA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type JsonRecord = Record<string, unknown>;

interface MovimentacaoCanonica {
  id: number;
  aluno_id: number;
  unidade_id: string;
  aluno_nome: string;
  telefone_snapshot: string | null;
  data: string;
  motivo: string | null;
  professor_id: number | null;
  curso_id: number | null;
  tempo_permanencia_meses: number | null;
}

interface AlunoDestinatario {
  data_nascimento: string | null;
  responsavel_nome: string | null;
  responsavel_telefone: string | null;
}

interface PreviewPersistida {
  auth_user_id: string;
  unidade_id: string;
  modo_teste: boolean;
}

interface ClaimEnvio {
  pesquisa_id: string;
  preview_id: string;
  evasao_id: number;
  modo_teste: boolean;
  telefone_destino: string;
  mensagem_renderizada: string;
  caixa_id: number;
  idempotency_key: string;
  envio_status: EstadoEnvioPersistido | "enviando" | "bloqueado";
  provider_message_id: string | null;
  deve_despachar: boolean;
}

class ErroHttp extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ErroHttp";
  }
}

function responderJson(
  payload: JsonRecord,
  status = 200,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function exigirAmbiente(nome: string): string {
  const valor = Deno.env.get(nome);
  if (!valor) {
    throw new Error(`Configuracao obrigatoria ausente: ${nome}`);
  }
  return valor;
}

function criarAuthAdapters(supabase: SupabaseClient): AuthAdapters {
  return {
    authGetUser: async (token) => {
      const { data, error } = await supabase.auth.getUser(token);
      if (error) throw error;
      return data.user ? { id: data.user.id } : null;
    },
    buscarUsuariosAtivosPorAuthUserId: async (authUserId) => {
      const { data, error } = await supabase
        .from("usuarios")
        .select("id, auth_user_id, nome")
        .eq("auth_user_id", authUserId)
        .eq("ativo", true)
        .limit(2);

      if (error) throw error;
      return (data ?? []).map((usuario) => ({
        id: Number(usuario.id),
        authUserId: String(usuario.auth_user_id),
        nome: String(usuario.nome),
      }));
    },
    buscarAssinaturasAtivas: async (usuarioId) => {
      const agora = new Date().toISOString();
      const { data, error } = await supabase
        .from("pesquisa_evasao_assinaturas")
        .select("id, nome_assinatura")
        .eq("usuario_id", usuarioId)
        .eq("ativo", true)
        .lte("valido_desde", agora)
        .or(`valido_ate.is.null,valido_ate.gt.${agora}`)
        .limit(2);

      if (error) throw error;
      return (data ?? []).map((assinatura) => ({
        id: String(assinatura.id),
        nome: String(assinatura.nome_assinatura),
      }));
    },
  };
}

function primeiroNome(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0];
  if (!primeiro) {
    throw new ErroHttp(422, "Nome de destinatario invalido");
  }
  return primeiro;
}

async function carregarMovimentacaoCanonica(
  supabase: SupabaseClient,
  evasaoId: number,
): Promise<MovimentacaoCanonica> {
  const { data: movimentacaoValida, error: erroValidade } = await supabase.rpc(
    "is_movimentacao_admin_retencao_valida",
    { p_movimentacao_id: evasaoId },
  );
  if (erroValidade) throw erroValidade;
  if (movimentacaoValida !== true) {
    throw new ErroHttp(404, "Movimentacao de evasao invalida");
  }

  const { data, error } = await supabase
    .from("movimentacoes_admin")
    .select(
      "id, aluno_id, unidade_id, aluno_nome, telefone_snapshot, data, motivo, professor_id, curso_id, tempo_permanencia_meses",
    )
    .eq("id", evasaoId)
    .limit(2);

  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new ErroHttp(404, "Movimentacao canonica nao encontrada");
  }

  const movimentacao = data[0] as unknown as MovimentacaoCanonica;
  if (
    !Number.isSafeInteger(Number(movimentacao.aluno_id)) ||
    typeof movimentacao.unidade_id !== "string" ||
    movimentacao.unidade_id.length === 0 ||
    typeof movimentacao.aluno_nome !== "string" ||
    movimentacao.aluno_nome.trim().length === 0 ||
    typeof movimentacao.data !== "string"
  ) {
    throw new ErroHttp(422, "Movimentacao canonica incompleta");
  }

  return movimentacao;
}

async function carregarAlunoDestinatario(
  supabase: SupabaseClient,
  alunoId: number,
): Promise<AlunoDestinatario> {
  const { data, error } = await supabase
    .from("alunos")
    .select("data_nascimento, responsavel_nome, responsavel_telefone")
    .eq("id", alunoId)
    .limit(2);

  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new ErroHttp(422, "Aluno da movimentacao nao encontrado");
  }

  return data[0] as AlunoDestinatario;
}

async function carregarNomeOpcional(
  supabase: SupabaseClient,
  tabela: "professores" | "cursos",
  id: number | null,
): Promise<string | null> {
  if (!id) return null;

  const { data, error } = await supabase
    .from(tabela)
    .select("nome")
    .eq("id", id)
    .limit(2);

  if (error) throw error;
  if (!data || data.length !== 1) return null;
  return typeof data[0].nome === "string" ? data[0].nome : null;
}

async function carregarNomeUnidade(
  supabase: SupabaseClient,
  unidadeId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("unidades")
    .select("nome")
    .eq("id", unidadeId)
    .limit(2);

  if (error) throw error;
  if (
    !data ||
    data.length !== 1 ||
    typeof data[0].nome !== "string" ||
    data[0].nome.trim().length === 0
  ) {
    throw new ErroHttp(422, "Unidade da movimentacao nao encontrada");
  }

  return data[0].nome.trim();
}

async function carregarPreviewPersistida(
  supabase: SupabaseClient,
  previewId: string,
): Promise<PreviewPersistida> {
  const { data, error } = await supabase
    .from("pesquisa_evasao_previews")
    .select("auth_user_id, unidade_id, modo_teste")
    .eq("id", previewId)
    .limit(2);

  if (error) throw error;
  if (!data || data.length !== 1) {
    throw new ErroHttp(404, "Preview nao encontrada");
  }

  const { auth_user_id, unidade_id, modo_teste } = data[0];
  if (
    typeof auth_user_id !== "string" ||
    typeof unidade_id !== "string" ||
    typeof modo_teste !== "boolean"
  ) {
    throw new ErroHttp(500, "Preview persistida inconsistente");
  }

  return { auth_user_id, unidade_id, modo_teste };
}

async function registrarResultado(
  supabase: SupabaseClient,
  claim: ClaimEnvio,
  authUserId: string,
  resultado: EstadoEnvioPersistido,
  providerMessageId: string | null = null,
  erroSanitizado: string | null = null,
): Promise<void> {
  const { error } = await supabase.rpc(
    "registrar_resultado_pesquisa_evasao_envio",
    {
      p_pesquisa_id: claim.pesquisa_id,
      p_preview_id: claim.preview_id,
      p_idempotency_key: claim.idempotency_key,
      p_auth_user_id: authUserId,
      p_resultado: resultado,
      p_provider_message_id: providerMessageId,
      p_erro_sanitizado: erroSanitizado,
    },
  );
  if (error) throw error;
}

async function registrarIncertoAposDispatch(
  supabase: SupabaseClient,
  claim: ClaimEnvio,
  authUserId: string,
): Promise<void> {
  try {
    await registrarResultado(
      supabase,
      claim,
      authUserId,
      "incerto",
    );
  } catch (error) {
    console.error(
      "[pesquisa-evasao] falha ao persistir estado incerto:",
      error instanceof Error ? error.message : "erro desconhecido",
    );
  }
}

async function abrirConversaBestEffort(
  supabase: SupabaseClient,
  claim: ClaimEnvio,
): Promise<ResultadoCapturaResposta> {
  const resultado = await prepararCapturaRespostaBestEffort(async () => {
    const { error } = await supabase
      .from("conversa_estado_whatsapp")
      .upsert(
        {
          whatsapp_numero: claim.telefone_destino,
          estado: "aguardando_resposta_evasao",
          contexto: {
            pesquisa_id: claim.pesquisa_id,
            evasao_id: claim.evasao_id,
          },
          expira_em: new Date(Date.now() + CONVERSA_TTL_MS).toISOString(),
        },
        { onConflict: "whatsapp_numero" },
      );
    return {
      error: error ? { message: error.message } : null,
    };
  });

  if (!resultado.capturaRespostaPreparada) {
    console.error(
      "[pesquisa-evasao] mensagem enviada; conversa nao preparada:",
      resultado.warning,
    );
  }
  return resultado;
}

async function confirmarResultadoPersistidoAposRespostaPerdida(
  supabase: SupabaseClient,
  claim: ClaimEnvio,
  authUserId: string,
  providerMessageId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc(
      "confirmar_resultado_pesquisa_evasao_envio",
      {
        p_pesquisa_id: claim.pesquisa_id,
        p_preview_id: claim.preview_id,
        p_idempotency_key: claim.idempotency_key,
        p_auth_user_id: authUserId,
        p_provider_message_id: providerMessageId,
      },
    );
    return !error && data === true;
  } catch {
    return false;
  }
}

async function enviarAoProvider(
  supabase: SupabaseClient,
  claim: ClaimEnvio,
): Promise<Awaited<ReturnType<typeof enviarMensagemComCredenciaisExatas>>> {
  try {
    return await enviarMensagemComCredenciaisExatas(
      {
        caixaId: claim.caixa_id,
        telefone: claim.telefone_destino,
        mensagem: claim.mensagem_renderizada,
      },
      {
        buscarCaixaExata: async (caixaId) => {
          try {
            const { data, error } = await supabase
              .from("whatsapp_caixas")
              .select(
                "id, provedor, uazapi_url, uazapi_token, waha_url, waha_session, waha_api_key",
              )
              .eq("id", caixaId)
              .eq("ativo", true)
              .limit(2);
            return {
              data: data ?? null,
              error: error ? { message: error.message } : null,
            };
          } catch {
            return {
              data: null,
              error: { message: "Falha ao consultar caixa exata" },
            };
          }
        },
      },
    );
  } catch (error) {
    if (error instanceof ErroConfiguracaoProvider) {
      throw new ErroHttp(502, "Configuracao do provedor indisponivel");
    }
    throw error;
  }
}

async function exigirSlotDisponivelParaPreview(
  supabase: SupabaseClient,
  evasaoId: number,
  modoTeste: boolean,
  telefoneDestino: string,
): Promise<void> {
  let query = supabase
    .from("pesquisa_evasao")
    .select("id")
    .eq("evasao_id", evasaoId)
    .eq("modo_teste", modoTeste)
    .in("envio_status", ["enviando", "incerto"])
    .limit(1);

  if (modoTeste) {
    query = query.eq("telefone_destino_snapshot", telefoneDestino);
  }

  const { data, error } = await query;
  if (error) throw error;
  if ((data ?? []).length > 0) {
    throw new ErroHttp(
      409,
      "Ja existe uma tentativa ativa para este destino",
    );
  }
}

async function previsualizar(
  supabase: SupabaseClient,
  adapters: AuthAdapters,
  identidade: Awaited<ReturnType<typeof autenticarUsuarioAtivoUnico>>,
  request: Extract<ReturnType<typeof validarRequest>, {
    acao: "previsualizar";
  }>,
): Promise<Response> {
  const movimentacao = await carregarMovimentacaoCanonica(
    supabase,
    request.evasao_id,
  );

  const assinatura = await resolverAssinaturaAtivaParaNovaPreview(
    identidade,
    adapters,
  );

  const aluno = await carregarAlunoDestinatario(
    supabase,
    movimentacao.aluno_id,
  );
  let publico: "direto" | "responsavel";
  try {
    publico = resolverPublicoPesquisa(aluno.data_nascimento);
  } catch (error) {
    const codigo = error instanceof Error ? error.message : "";
    if (codigo === "DATA_NASCIMENTO_AUSENTE") {
      throw new ErroHttp(422, "Data de nascimento nao cadastrada");
    }
    if (codigo === "DATA_NASCIMENTO_INVALIDA") {
      throw new ErroHttp(422, "Data de nascimento invalida");
    }
    throw error;
  }
  const destinatario = publico === "responsavel"
    ? aluno.responsavel_nome?.trim()
    : movimentacao.aluno_nome.trim();
  if (!destinatario) {
    throw new ErroHttp(422, "Destinatario da pesquisa nao encontrado");
  }

  const { data: templatesData, error: templatesError } = await supabase
    .from("pesquisa_evasao_templates")
    .select("id, versao, publico, corpo")
    .eq("publico", publico)
    .eq("ativo", true)
    .limit(2);
  if (templatesError) throw templatesError;
  const templates = templatesData ?? [];
  if (templates.length !== 1) {
    throw new ErroHttp(
      409,
      "Template ativo nao encontrado de forma unica",
    );
  }
  const template = templates[0];

  let destino: DestinoPesquisa;
  try {
    destino = resolverDestinoPesquisaPorPublico({
      modoTeste: request.modo_teste,
      publico,
      telefoneTeste: request.telefone_teste,
      telefoneSnapshot: movimentacao.telefone_snapshot,
      telefoneResponsavel: aluno.responsavel_telefone,
    });
  } catch (error) {
    const codigo = error instanceof Error ? error.message : "";
    if (codigo === "RESPONSAVEL_SEM_TELEFONE") {
      throw new ErroHttp(422, "Responsavel sem telefone cadastrado");
    }
    if (codigo === "RESPONSAVEL_TELEFONE_INVALIDO") {
      throw new ErroHttp(422, "Telefone do responsavel invalido");
    }
    if (codigo === "TELEFONE_RESPONSAVEL_DIVERGENTE") {
      throw new ErroHttp(
        409,
        "Telefone salvo na saida diverge do telefone atual do responsavel",
      );
    }
    throw error;
  }
  await exigirSlotDisponivelParaPreview(
    supabase,
    movimentacao.id,
    request.modo_teste,
    destino.telefone,
  );
  const mensagem = renderizarMensagem({
    template: String(template.corpo),
    valores: {
      aluno_primeiro_nome: primeiroNome(movimentacao.aluno_nome),
      responsavel_primeiro_nome: primeiroNome(destinatario),
      assinatura_nome: assinatura.assinaturaNome,
    },
  });

  const templateVersao = Number(template.versao);
  const snapshot = {
    evasaoId: movimentacao.id,
    unidadeId: movimentacao.unidade_id,
    usuarioId: identidade.usuarioId,
    authUserId: identidade.authUserId,
    assinaturaId: assinatura.assinaturaId,
    templateId: String(template.id),
    templateVersao,
    caixaId: CAIXA_SUCESSO_ID,
    modoTeste: request.modo_teste,
    destinatarioTipo: request.modo_teste
      ? "teste" as const
      : publico === "responsavel"
      ? "responsavel" as const
      : "aluno" as const,
    telefoneDestino: destino.telefone,
    mensagemRenderizada: mensagem,
  };
  const payloadHash = await hashPreview(snapshot);
  const expiraEm = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
  const [unidadeNome, cursoNome, professorNome] = await Promise.all([
    carregarNomeUnidade(supabase, movimentacao.unidade_id),
    carregarNomeOpcional(supabase, "cursos", movimentacao.curso_id),
    carregarNomeOpcional(supabase, "professores", movimentacao.professor_id),
  ]);

  const { data: preview, error: previewError } = await supabase
    .from("pesquisa_evasao_previews")
    .insert({
      evasao_id: movimentacao.id,
      unidade_id: movimentacao.unidade_id,
      usuario_id: identidade.usuarioId,
      auth_user_id: identidade.authUserId,
      assinatura_id: assinatura.assinaturaId,
      template_id: String(template.id),
      caixa_id: CAIXA_SUCESSO_ID,
      modo_teste: request.modo_teste,
      destinatario_tipo: snapshot.destinatarioTipo,
      telefone_destino: destino.telefone,
      mensagem_renderizada: mensagem,
      payload_hash: payloadHash,
      idempotency_key: crypto.randomUUID(),
      expira_em: expiraEm,
      aluno_id: movimentacao.aluno_id,
      aluno_nome_snapshot: movimentacao.aluno_nome,
      destinatario_nome_snapshot: destinatario,
      publico_template_snapshot: publico,
      curso_nome_snapshot: cursoNome,
      professor_nome_snapshot: professorNome,
      tempo_permanencia_meses_snapshot: movimentacao.tempo_permanencia_meses,
      data_evasao_snapshot: movimentacao.data,
      motivo_cadastrado_snapshot: movimentacao.motivo,
      assinatura_nome_snapshot: assinatura.assinaturaNome,
      template_versao: templateVersao,
    })
    .select("id, expira_em")
    .single();

  if (previewError) throw previewError;
  return responderJson({
    preview_id: preview.id,
    expira_em: preview.expira_em,
    aluno: movimentacao.aluno_nome,
    destinatario,
    destinatario_tipo: snapshot.destinatarioTipo,
    telefone_mascarado: mascararTelefone(destino.telefone),
    unidade: unidadeNome,
    curso: cursoNome,
    professor: professorNome,
    assinatura: assinatura.assinaturaNome,
    mensagem,
    modo_teste: request.modo_teste,
    alertas: request.modo_teste
      ? ["Envio direcionado ao telefone de teste"]
      : [],
  });
}

async function confirmar(
  supabase: SupabaseClient,
  identidade: Awaited<ReturnType<typeof autenticarUsuarioAtivoUnico>>,
  request: Extract<ReturnType<typeof validarRequest>, {
    acao: "confirmar";
  }>,
): Promise<Response> {
  const previewPersistida = await carregarPreviewPersistida(
    supabase,
    request.preview_id,
  );
  if (previewPersistida.auth_user_id !== identidade.authUserId) {
    throw new ErroAutorizacao(403, "Preview pertence a outro usuario");
  }

  const { auth_user_id } = previewPersistida;

  const { data: claimsData, error: claimError } = await supabase.rpc(
    "claim_pesquisa_evasao_preview",
    {
      p_preview_id: request.preview_id,
      p_auth_user_id: auth_user_id,
    },
  );
  if (claimError) throw claimError;

  const claims = Array.isArray(claimsData) ? claimsData : [];
  if (claims.length !== 1) {
    throw new ErroHttp(500, "Claim nao retornou snapshot unico");
  }
  const claim = claims[0] as ClaimEnvio;

  if (claim.deve_despachar !== true) {
    return responderJson({
      success: claim.envio_status === "enviado",
      pesquisa_id: claim.pesquisa_id,
      preview_id: claim.preview_id,
      envio_status: claim.envio_status,
      provider_message_id: claim.provider_message_id,
      modo_teste: claim.modo_teste,
      deve_despachar: false,
    });
  }

  let respostaProvider: Awaited<ReturnType<typeof enviarAoProvider>>;
  try {
    respostaProvider = await enviarAoProvider(supabase, claim);
  } catch (error) {
    if (error instanceof ErroHttp) {
      await registrarResultado(
        supabase,
        claim,
        identidade.authUserId,
        "falhou",
        null,
        "Configuracao do provedor indisponivel",
      );
      throw error;
    }

    await registrarIncertoAposDispatch(
      supabase,
      claim,
      identidade.authUserId,
    );
    return responderJson(
      {
        success: false,
        pesquisa_id: claim.pesquisa_id,
        preview_id: claim.preview_id,
        envio_status: "incerto",
        modo_teste: claim.modo_teste,
        mensagem:
          "Resultado do provedor ambiguo; reconciliacao humana obrigatoria",
      },
      202,
    );
  }

  const classificacao = classificarRespostaProvider(
    respostaProvider.statusHttp,
    respostaProvider.payload,
  );
  if (classificacao.tipo === "falha_conhecida") {
    const erroSanitizado = sanitizarErroProvider(
      classificacao.statusHttp,
    );
    await registrarResultado(
      supabase,
      claim,
      identidade.authUserId,
      "falhou",
      null,
      erroSanitizado,
    );
    return responderJson(
      {
        success: false,
        pesquisa_id: claim.pesquisa_id,
        preview_id: claim.preview_id,
        envio_status: "falhou",
        modo_teste: claim.modo_teste,
        error: "Falha conhecida no envio da mensagem",
      },
      502,
    );
  }

  if (classificacao.tipo === "incerto") {
    await registrarResultado(
      supabase,
      claim,
      identidade.authUserId,
      "incerto",
    );
    return responderJson(
      {
        success: false,
        pesquisa_id: claim.pesquisa_id,
        preview_id: claim.preview_id,
        envio_status: "incerto",
        modo_teste: claim.modo_teste,
        mensagem:
          "Resultado do provedor ambiguo; reconciliacao humana obrigatoria",
      },
      202,
    );
  }

  const sucessoPersistido = await persistirOuConfirmarResultadoEnviado({
    registrar: () =>
      registrarResultado(
        supabase,
        claim,
        identidade.authUserId,
        "enviado",
        classificacao.providerMessageId,
      ),
    confirmarPersistido: () =>
      confirmarResultadoPersistidoAposRespostaPerdida(
        supabase,
        claim,
        identidade.authUserId,
        classificacao.providerMessageId,
      ),
  });
  if (!sucessoPersistido) {
    await registrarIncertoAposDispatch(
      supabase,
      claim,
      identidade.authUserId,
    );
    return responderJson(
      {
        success: false,
        pesquisa_id: claim.pesquisa_id,
        preview_id: claim.preview_id,
        envio_status: "incerto",
        modo_teste: claim.modo_teste,
        mensagem:
          "Mensagem aceita pelo provedor, mas a persistencia ficou incerta",
      },
      202,
    );
  }

  let capturaResposta: ResultadoCapturaResposta = {
    capturaRespostaPreparada: false,
  };
  if (deveAbrirConversaReal(claim.modo_teste, "enviado")) {
    capturaResposta = await abrirConversaBestEffort(supabase, claim);
  }

  const payloadSucesso: JsonRecord = {
    success: true,
    pesquisa_id: claim.pesquisa_id,
    preview_id: claim.preview_id,
    envio_status: "enviado",
    provider_message_id: classificacao.providerMessageId,
    provedor: respostaProvider.provedor,
    modo_teste: claim.modo_teste,
    captura_resposta_preparada: capturaResposta.capturaRespostaPreparada,
  };
  if (capturaResposta.warning) {
    payloadSucesso.warning = capturaResposta.warning;
  }
  return responderJson(payloadSucesso);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return responderJson({ error: "Metodo nao permitido" }, 405);
  }

  try {
    const authorization = req.headers.get("Authorization");
    const supabase = createClient(
      exigirAmbiente("SUPABASE_URL"),
      exigirAmbiente("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
    const adapters = criarAuthAdapters(supabase);
    const identidade = await autenticarUsuarioAtivoUnico(
      { authorization },
      adapters,
    );

    let corpo: unknown;
    try {
      corpo = await req.json();
    } catch {
      throw new ErroHttp(400, "JSON invalido");
    }
    const request = validarRequest(corpo);

    if (request.acao === "previsualizar") {
      return await previsualizar(
        supabase,
        adapters,
        identidade,
        request,
      );
    }
    if (request.acao === "confirmar") {
      return await confirmar(
        supabase,
        identidade,
        request,
      );
    }

    throw new ErroHttp(400, "Acao invalida");
  } catch (error) {
    if (error instanceof ErroAutorizacao || error instanceof ErroHttp) {
      return responderJson({ error: error.message }, error.status);
    }
    if (
      error instanceof Error && /Request|Campo|invalido|modo_teste/.test(
        error.message,
      )
    ) {
      return responderJson({ error: error.message }, 400);
    }

    console.error(
      "[pesquisa-evasao] erro interno:",
      error instanceof Error ? error.message : "erro desconhecido",
    );
    return responderJson({ error: "Erro interno ao processar pesquisa" }, 500);
  }
});
