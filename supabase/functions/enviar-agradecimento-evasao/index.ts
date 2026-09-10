// @ts-nocheck
//
// Agradecimento automatico apos a resposta da pesquisa de evasao.
//
// ⚠️ ESTA E A UNICA WRITE ACTION desta cadeia -- o unico lugar em todo o fluxo
// da pesquisa de evasao que manda mensagem por causa de uma decisao de LLM.
// Ela e uma edge separada de proposito (e nao um bloco dentro de
// `processar-conversa-evasao`) por tres razoes:
//   1. da para exercitar em `dry_run` sem tocar em nada;
//   2. o orquestrador da consolidacao nao passa a carregar credencial de WhatsApp;
//   3. isola a acao depois dos guardrails, que e o desenho recomendado.
//
// ⚠️ ELA NAO CONFIA NO CHAMADOR. Recebe (pesquisa_id, analise_versao) e vai ler
// sozinha o veredito, o kill switch, a idade da analise e o teto do dia. Um
// chamador com bug nao consegue induzir envio -- no maximo pedir um que sera
// recusado pelos portoes.
//
// ⚠️ O VEREDITO NAO E RECALCULADO AQUI. Ele e lido do que o classificador ja
// gravou em `automacao_log` (`acao='classificacao_ia_evasao'`). Chamar o modelo
// de novo custaria uma segunda opiniao que poderia divergir da que ficou
// registrada -- e a auditoria passaria a mentir sobre por que a mensagem saiu.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  decidirEnvioAgradecimento,
  TETO_DIARIO_AGRADECIMENTO,
} from "../_shared/pesquisa-evasao-agradecimento.ts";
import { renderizarMensagem } from "../_shared/pesquisa-evasao-render.ts";
import {
  classificarRespostaProvider,
  enviarMensagemComCredenciaisExatas,
  ErroConfiguracaoProvider,
  sanitizarErroProvider,
} from "../_shared/pesquisa-evasao-provider.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("SYNC_PRESENCA_EDGE_TOKEN")?.trim() || "";

const ACAO_LOG = "agradecimento_evasao";
const ACAO_CLASSIFICACAO = "classificacao_ia_evasao";

// Topico "Logs" do grupo Telegram Lia Core, criado em 02/09/2026.
const TELEGRAM_CHAT_ID = "-1004305762065";
const TELEGRAM_THREAD_ID = 347;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function primeiroNome(nome: string): string {
  return String(nome ?? "").trim().split(/\s+/)[0] ?? "";
}

function chaveIdempotencia(pesquisaId: string, analiseVersao: number): string {
  return `${ACAO_LOG}:${pesquisaId}:${analiseVersao}`;
}

/** Inicio do dia em BRT, expresso em UTC -- o teto e diario no fuso do negocio. */
function inicioDoDiaBrt(agora: Date): string {
  const brt = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const dia = brt.toISOString().slice(0, 10);
  return new Date(`${dia}T03:00:00.000Z`).toISOString();
}

// O token do cron vive no vault e e validado NO BANCO, nunca em env var --
// mesmo padrao do worker da repescagem, adotado depois de um 401 silencioso em
// 100% das chamadas com o `pg_cron` marcando `succeeded`.
async function autorizado(
  supabase: SupabaseClient,
  recebido: string | null,
  bearer: string,
): Promise<boolean> {
  if (bearer !== "" && bearer === SERVICE_ROLE_KEY) return true;
  if (WORKER_TOKEN && recebido === WORKER_TOKEN) return true;
  if (!recebido) return false;
  const { data, error } = await supabase.rpc(
    "validar_token_sync_presenca_interno_v1",
    { p_token: recebido },
  );
  return !error && data === true;
}

/**
 * Log no topico Logs do Lia Core.
 *
 * ⚠️ Posta ENVIADOS **e** BARRADOS. Só os enviados mostram o que deu errado; os
 * barrados sao a unica forma de saber se os portoes estao calibrados -- e ate
 * 02/09/2026 tres dos quatro nunca tinham sido exercitados por dado real.
 *
 * ⚠️ Falha aqui nunca derruba o envio: o log e o observador, nao a operacao.
 * Mas tambem nao some em silencio -- vai para o console, que e onde alguem
 * procura quando o Telegram fica mudo.
 */
async function logarNoLiaCore(
  supabase: SupabaseClient,
  texto: string,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("integracao_tokens")
      .select("token")
      .eq("nome", "telegram_bot_lia")
      .maybeSingle();
    if (error || !data?.token) {
      console.error("enviar-agradecimento-evasao: token do Telegram indisponivel", {
        erro: error?.message ?? "nao_cadastrado",
      });
      return;
    }
    const resposta = await fetch(
      `https://api.telegram.org/bot${data.token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          message_thread_id: TELEGRAM_THREAD_ID,
          text: texto,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!resposta.ok) {
      console.error("enviar-agradecimento-evasao: Telegram recusou", {
        status: resposta.status,
        corpo: (await resposta.text()).slice(0, 300),
      });
    }
  } catch (erro) {
    console.error("enviar-agradecimento-evasao: Telegram indisponivel", {
      erro: erro instanceof Error ? erro.message : "desconhecido",
    });
  }
}

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "metodo_nao_permitido" }, 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
  if (!await autorizado(supabase, req.headers.get("x-sync-token"), bearer)) {
    return json({ error: "nao_autorizado" }, 401);
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "pedido_invalido" }, 400);
  }

  const pesquisaId = String(corpo.pesquisa_id ?? "").trim();
  const analiseVersao = Number(corpo.analise_versao ?? 0);
  // `dry_run` roda a decisao inteira contra o estado real e NAO envia nem grava.
  // E como o primeiro caso vai ser conferido antes de a automacao ser ligada.
  const dryRun = corpo.dry_run === true;
  if (!pesquisaId || !Number.isInteger(analiseVersao) || analiseVersao < 1) {
    return json({ error: "parametros_invalidos" }, 400);
  }

  const agora = new Date();
  const chave = chaveIdempotencia(pesquisaId, analiseVersao);

  // --- Estado, lido aqui e nao recebido do chamador --------------------------
  const [config, classificacaoLog, analise, jaLog, jaNaPesquisa, doDia, pesquisa] = await Promise
    .all([
    supabase.from("automacoes_config").select("ativo")
      .eq("slug", "auto_agradecimento_evasao").maybeSingle(),
    supabase.from("automacao_log").select("detalhes, created_at")
      .eq("acao", ACAO_CLASSIFICACAO)
      .eq("detalhes->>pesquisa_id", pesquisaId)
      .eq("detalhes->>analise_versao", String(analiseVersao))
      .order("created_at", { ascending: false }).limit(1),
    supabase.from("pesquisa_evasao_analises").select("encerrada_em, status, texto_consolidado")
      .eq("pesquisa_id", pesquisaId).eq("versao", analiseVersao).maybeSingle(),
    supabase.from("automacao_log").select("id").eq("idempotency_key", chave).maybeSingle(),
    // Um agradecimento por PESQUISA, nao por analise. `status='ok'` de proposito:
    // so bloqueia quando a mensagem REALMENTE saiu -- reserva orfa (`warn`) ou
    // envio que falhou (`erro`) nao podem impedir a tentativa legitima.
    supabase.from("automacao_log").select("id", { count: "exact", head: true })
      .eq("acao", ACAO_LOG).eq("status", "ok")
      .eq("detalhes->>pesquisa_id", pesquisaId),
    supabase.from("automacao_log").select("id", { count: "exact", head: true })
      .eq("acao", ACAO_LOG).not("idempotency_key", "is", null)
      .gte("created_at", inicioDoDiaBrt(agora)),
    supabase.from("pesquisa_evasao").select(
      "id, aluno_nome, telefone_destino_snapshot, caixa_id, preview_id, " +
        "template_id, opt_out_em, modo_teste, unidade_id",
    ).eq("id", pesquisaId).maybeSingle(),
  ]);

  if (!pesquisa.data) return json({ error: "pesquisa_nao_encontrada" }, 404);

  // Opt-out nao e portao da regra pura porque nao e decisao de calibragem: e
  // proibicao absoluta, e vale mesmo com tudo o mais liberado.
  if (pesquisa.data.opt_out_em) {
    return json({ ok: true, enviado: false, motivo: "opt_out" });
  }
  if (pesquisa.data.modo_teste) {
    return json({ ok: true, enviado: false, motivo: "modo_teste" });
  }

  const detalhes = (classificacaoLog.data?.[0]?.detalhes ?? null) as
    | Record<string, unknown>
    | null;
  const decisao = decidirEnvioAgradecimento({
    automacaoAtiva: config.data?.ativo === true,
    classificacao: detalhes
      ? {
        agradecer: detalhes.agradecer === true,
        motivo_nao_agradecer: (detalhes.motivo_nao_agradecer as string) ?? null,
      }
      : null,
    jaAgradecido: Boolean(jaLog.data),
    jaAgradecidoNestaPesquisa: (jaNaPesquisa.count ?? 0) > 0,
    analiseEncerradaEm: analise.data?.encerrada_em ?? null,
    enviadosHoje: doDia.count ?? 0,
  }, agora);

  const aluno = String(pesquisa.data.aluno_nome ?? "");

  if (decisao.acao === "nao_enviar") {
    // Barrado tambem vira log -- mas SEM `idempotency_key`: a chave e a reserva
    // do envio, e gravar barrado com ela impediria para sempre um envio legitimo
    // depois (o caso obvio e "teto_diario", que amanha ja nao vale).
    if (!dryRun) {
      await supabase.from("automacao_log").insert({
        evento: "pesquisa_evasao",
        acao: ACAO_LOG,
        status: "warn",
        aluno_nome: aluno,
        detalhes: {
          pesquisa_id: pesquisaId,
          analise_versao: analiseVersao,
          enviado: false,
          motivo: decisao.motivo,
        },
      });
      await logarNoLiaCore(
        supabase,
        `🤫 *Agradecimento NAO enviado*\n` +
          `Aluno: ${aluno}\nMotivo: \`${decisao.motivo}\`\n` +
          `_Pesquisa ${pesquisaId.slice(0, 8)} · analise v${analiseVersao}_`,
      );
    }
    return json({ ok: true, enviado: false, motivo: decisao.motivo, dry_run: dryRun });
  }

  // --- Texto ----------------------------------------------------------------
  // O publico vem do template do 1o toque, nunca recalculado: quem recebeu a
  // pergunta e quem recebe o obrigado. Recalcular por idade ou por telefone
  // reintroduziria a divergencia que ja custou caro na repescagem.
  const { data: templateOrigem } = await supabase
    .from("pesquisa_evasao_templates").select("publico")
    .eq("id", pesquisa.data.template_id).maybeSingle();
  const publico = String(templateOrigem?.publico ?? "");
  if (publico !== "direto" && publico !== "responsavel") {
    return json({ ok: true, enviado: false, motivo: "publico_indeterminado" });
  }

  const { data: template } = await supabase
    .from("pesquisa_evasao_templates").select("corpo, versao")
    .eq("chave", "evasao_agradecimento").eq("publico", publico).eq("ativo", true)
    .maybeSingle();
  if (!template?.corpo) {
    return json({ ok: true, enviado: false, motivo: "template_ausente" });
  }

  // No publico responsavel, o nome de quem recebeu o 1o toque mora no snapshot
  // do preview -- usar o nome do aluno cumprimentaria a mae pelo nome do filho.
  let destinatario: string | null = null;
  if (pesquisa.data.preview_id) {
    const { data: preview } = await supabase
      .from("pesquisa_evasao_previews").select("destinatario_nome_snapshot")
      .eq("id", pesquisa.data.preview_id).maybeSingle();
    destinatario = preview?.destinatario_nome_snapshot ?? null;
  }
  if (publico === "responsavel" && !destinatario?.trim()) {
    return json({ ok: true, enviado: false, motivo: "destinatario_indeterminado" });
  }

  let mensagem: string;
  try {
    mensagem = renderizarMensagem({
      template: String(template.corpo),
      valores: {
        aluno_primeiro_nome: primeiroNome(aluno),
        responsavel_primeiro_nome: publico === "responsavel"
          ? primeiroNome(String(destinatario))
          : primeiroNome(aluno),
      },
    });
  } catch (erro) {
    return json({
      ok: true,
      enviado: false,
      motivo: erro instanceof Error ? erro.message : "render_falhou",
    });
  }

  const telefone = String(pesquisa.data.telefone_destino_snapshot ?? "");
  if (!telefone) return json({ ok: true, enviado: false, motivo: "telefone_ausente" });

  if (dryRun) {
    return json({
      ok: true,
      enviado: false,
      dry_run: true,
      motivo: "dry_run",
      publico,
      teto_diario: TETO_DIARIO_AGRADECIMENTO,
      enviados_hoje: doDia.count ?? 0,
      mensagem,
    });
  }

  // --- Reserva ANTES do envio ----------------------------------------------
  // O UNIQUE parcial de `automacao_log.idempotency_key` e quem garante um
  // agradecimento por analise mesmo com duas execucoes simultaneas -- e um
  // disparo de cron neste projeto costuma virar 2 a 4 execucoes da edge.
  // Reservar depois do envio deixaria a janela aberta para mandar duas vezes.
  const { error: erroReserva } = await supabase.from("automacao_log").insert({
    evento: "pesquisa_evasao",
    acao: ACAO_LOG,
    status: "warn",
    aluno_nome: aluno,
    idempotency_key: chave,
    detalhes: {
      pesquisa_id: pesquisaId,
      analise_versao: analiseVersao,
      fase: "reservado",
      publico,
    },
  });
  if (erroReserva) {
    // 23505 = outra execucao ja reservou. Nao e erro: e a trava funcionando.
    const concorrencia = erroReserva.code === "23505";
    if (!concorrencia) {
      console.error("enviar-agradecimento-evasao: reserva falhou", {
        pesquisaId,
        erro: erroReserva.message,
      });
    }
    return json({
      ok: true,
      enviado: false,
      motivo: concorrencia ? "ja_reservado" : "reserva_falhou",
    });
  }

  // --- Envio ----------------------------------------------------------------
  let resultado;
  try {
    resultado = await enviarMensagemComCredenciaisExatas(
      { caixaId: Number(pesquisa.data.caixa_id), telefone, mensagem },
      {
        buscarCaixaExata: async (caixaId: number) => {
          const { data, error } = await supabase.from("whatsapp_caixas").select(
            "id, provedor, uazapi_url, uazapi_token, waha_url, waha_session, waha_api_key",
          ).eq("id", caixaId).eq("ativo", true).limit(2);
          return { data: data ?? null, error: error ? { message: error.message } : null };
        },
      },
    );
  } catch (erro) {
    const motivo = erro instanceof ErroConfiguracaoProvider
      ? "configuracao_provider_invalida"
      : "provider_indisponivel";
    await supabase.from("automacao_log").update({
      status: "erro",
      detalhes: {
        pesquisa_id: pesquisaId,
        analise_versao: analiseVersao,
        fase: "falhou",
        motivo,
      },
    }).eq("idempotency_key", chave);
    await logarNoLiaCore(
      supabase,
      `🔴 *Agradecimento FALHOU*\nAluno: ${aluno}\nMotivo: \`${motivo}\``,
    );
    return json({ ok: true, enviado: false, motivo });
  }

  const classificacao = classificarRespostaProvider(resultado.statusHttp, resultado.payload);
  if (classificacao.tipo !== "sucesso") {
    // Diferente da repescagem, "incerto" aqui NAO precisa ser terminal por
    // decisao especial: a reserva ja consumiu a chave e nada vai tentar de novo.
    const motivo = classificacao.tipo === "incerto"
      ? `incerto: sem confirmacao do provedor (HTTP ${resultado.statusHttp})`
      : sanitizarErroProvider(classificacao.statusHttp);
    await supabase.from("automacao_log").update({
      status: "erro",
      detalhes: {
        pesquisa_id: pesquisaId,
        analise_versao: analiseVersao,
        fase: "falhou",
        motivo,
      },
    }).eq("idempotency_key", chave);
    await logarNoLiaCore(
      supabase,
      `🔴 *Agradecimento FALHOU*\nAluno: ${aluno}\nMotivo: \`${motivo}\``,
    );
    return json({ ok: true, enviado: false, motivo: classificacao.tipo });
  }

  // --- Registro -------------------------------------------------------------
  const { error: erroMensagem } = await supabase.from("pesquisa_evasao_mensagens").insert({
    pesquisa_id: pesquisaId,
    caixa_id: Number(pesquisa.data.caixa_id),
    direcao: "saida",
    tipo: "texto",
    texto: mensagem,
    telefone_normalizado: telefone.replace(/\D/g, ""),
    provider_message_id: classificacao.providerMessageId,
    resolution_status: "resolvida",
  });
  if (erroMensagem) {
    // A mensagem ja saiu; falha de auditoria nao pode virar reenvio.
    console.error("enviar-agradecimento-evasao: falha ao registrar a saida", {
      pesquisaId,
      erro: erroMensagem.message,
    });
  }

  await supabase.from("automacao_log").update({
    status: "ok",
    detalhes: {
      pesquisa_id: pesquisaId,
      analise_versao: analiseVersao,
      fase: "enviado",
      publico,
      provider_message_id: classificacao.providerMessageId,
      texto: mensagem,
    },
  }).eq("idempotency_key", chave);

  await logarNoLiaCore(
    supabase,
    `✅ *Agradecimento enviado*\n` +
      `Aluno: ${aluno}\nPúblico: ${publico}\n` +
      `Hoje: ${(doDia.count ?? 0) + 1}/${TETO_DIARIO_AGRADECIMENTO}\n` +
      `_Pesquisa ${pesquisaId.slice(0, 8)} · analise v${analiseVersao}_`,
  );

  return json({ ok: true, enviado: true, publico });
});
