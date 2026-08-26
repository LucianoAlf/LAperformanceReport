// @ts-nocheck
//
// Worker da fila de repescagem da pesquisa de evasao. Disparado por cron a
// cada minuto; o mesmo disparo produz 2 a 4 execucoes simultaneas desta edge
// (padrao ja observado neste projeto entre o pg_cron e o gateway), entao a
// regra de ouro e: UMA linha por invocacao, tomada de forma atomica pela RPC
// `claim_repescagem_evasao_job` (SELECT ... FOR UPDATE SKIP LOCKED). Quem nao
// consegue a linha responde {ok:true, processado:0} e sai sem tentar de novo.
//
// A segunda regra e que uma resposta "incerta" do provider (nao se sabe se a
// mensagem chegou) e TERMINAL: entre mandar duas vezes para um ex-aluno e nao
// mandar, o sistema nao manda.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  autenticarWorkerInterno,
  decidirEnvioRepescagem,
} from "./contract.ts";
import { renderizarMensagem } from "../enviar-pesquisa-evasao/contract.ts";
import {
  alunoComPreposicao,
  assinaturaComArtigo,
} from "../enviar-pesquisa-evasao/tratamentoGramatical.ts";
import {
  classificarRespostaProvider,
  enviarMensagemComCredenciaisExatas,
  ErroConfiguracaoProvider,
  sanitizarErroProvider,
} from "../_shared/pesquisa-evasao-provider.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN = Deno.env.get("SYNC_PRESENCA_EDGE_TOKEN")?.trim() || "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// A copia local existe porque `enviar-pesquisa-evasao/index.ts:179` nao
// exporta a sua versao (que lanca ErroHttp, tipo especifico daquela edge).
function primeiroNome(nome: string): string {
  return String(nome ?? "").trim().split(/\s+/)[0] ?? "";
}

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "metodo_nao_permitido" }, 405);
  if (!autenticarWorkerInterno(req.headers.get("x-sync-token"), WORKER_TOKEN)) {
    return json({ error: "nao_autorizado" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const workerId = crypto.randomUUID();

  // 1. Toma UMA linha. As demais execucoes do mesmo disparo recebem null aqui.
  const { data: job, error: erroClaim } = await supabase.rpc(
    "claim_repescagem_evasao_job",
    { p_worker_id: workerId, p_lease_seconds: 120 },
  );
  if (erroClaim) return json({ error: "claim_indisponivel" }, 503);
  if (!job) return json({ ok: true, processado: 0 });

  // 2. Le o estado atual da pesquisa e revalida.
  const { data: pesquisa, error: erroPesquisa } = await supabase
    .from("pesquisa_evasao")
    .select(
      "id, aluno_nome, aluno_telefone, telefone_destino_snapshot, caixa_id, " +
        "resposta_status, envio_status, opt_out_em, assinatura_nome_snapshot",
    )
    .eq("id", job.pesquisa_id)
    .maybeSingle();

  if (erroPesquisa || !pesquisa) {
    await supabase.rpc("falhar_repescagem_evasao_job", {
      p_id: job.id,
      p_worker_id: workerId,
      p_erro: "pesquisa_nao_encontrada",
      p_terminal: true,
    });
    return json({ ok: true, processado: 0, motivo: "pesquisa_nao_encontrada" });
  }

  const { count: saidasDoToque } = await supabase
    .from("pesquisa_evasao_mensagens")
    .select("id", { count: "exact", head: true })
    .eq("pesquisa_id", job.pesquisa_id)
    .eq("direcao", "saida");

  const decisao = decidirEnvioRepescagem({
    respostaStatus: String(pesquisa.resposta_status),
    envioStatus: String(pesquisa.envio_status),
    optOutEm: pesquisa.opt_out_em ?? null,
    jaExisteSaidaDoToque: (saidasDoToque ?? 0) > 0,
  });

  // 3. Cancelar encerra a rodada sem enviar nada.
  if (decisao.acao === "cancelar") {
    await supabase.rpc("falhar_repescagem_evasao_job", {
      p_id: job.id,
      p_worker_id: workerId,
      p_erro: decisao.motivo,
      p_terminal: true,
    });
    return json({ ok: true, processado: 0, motivo: decisao.motivo });
  }

  // 4. Renderiza o template do toque pelo publico do destino.
  const { data: template } = await supabase
    .from("pesquisa_evasao_templates")
    .select("corpo, publico")
    .eq("id", job.template_id)
    .maybeSingle();

  const telefoneDestino = String(pesquisa.telefone_destino_snapshot ?? "");
  const soDigitos = (valor: string) => valor.replace(/\D/g, "");

  // O publico ja foi decidido no 1o toque e viaja no template escolhido pela
  // RPC de enfileiramento (`job.template_id`). O worker nao recalcula publico:
  // nem por idade (regra de resolverPublicoPesquisa, que exige data_nascimento),
  // nem por telefone (o numero do responsavel costuma ser o do aluno).
  const publico = String(template?.publico ?? "");

  // A assinatura e a MESMA do 1o toque: o texto diz "aqui e a Fulana de novo".
  const assinatura = String(pesquisa.assinatura_nome_snapshot ?? "");
  if (!template?.corpo || !assinatura || !telefoneDestino) {
    await supabase.rpc("falhar_repescagem_evasao_job", {
      p_id: job.id,
      p_worker_id: workerId,
      p_erro: "dados_insuficientes_para_render",
      p_terminal: true,
    });
    return json({ ok: true, processado: 0, motivo: "dados_insuficientes" });
  }

  let mensagem: string;
  try {
    mensagem = renderizarMensagem({
      template: String(template.corpo),
      valores: {
        aluno_primeiro_nome: primeiroNome(String(pesquisa.aluno_nome)),
        responsavel_primeiro_nome: primeiroNome(String(pesquisa.aluno_nome)),
        assinatura_nome: assinatura,
        assinatura_com_artigo: assinaturaComArtigo(assinatura),
        aluno_com_preposicao: alunoComPreposicao(
          primeiroNome(String(pesquisa.aluno_nome)),
        ),
      },
    });
  } catch (erro) {
    await supabase.rpc("falhar_repescagem_evasao_job", {
      p_id: job.id,
      p_worker_id: workerId,
      p_erro: erro instanceof Error ? erro.message : "render_falhou",
      p_terminal: true,
    });
    return json({ ok: true, processado: 0, motivo: "render_falhou" });
  }

  // 5. Envia pelo provider unico.
  let resultado: Awaited<ReturnType<typeof enviarMensagemComCredenciaisExatas>>;
  try {
    resultado = await enviarMensagemComCredenciaisExatas(
      {
        caixaId: Number(pesquisa.caixa_id),
        telefone: telefoneDestino,
        mensagem,
      },
      {
        buscarCaixaExata: async (caixaId: number) => {
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
        },
      },
    );
  } catch (erro) {
    // ErroConfiguracaoProvider e lancado ANTES de qualquer chamada de rede
    // (caixa ausente/inativa, credencial faltando): sabemos com certeza que
    // nada foi enviado, entao pode tentar de novo (nao terminal, respeita
    // max_tentativas). Qualquer OUTRA excecao (timeout, falha de rede) e a
    // mesma incerteza que classificarRespostaProvider chama de "incerto": nao
    // sabemos se a mensagem chegou ao provider, e por isso e terminal.
    const erroDeConfiguracao = erro instanceof ErroConfiguracaoProvider;
    await supabase.rpc("falhar_repescagem_evasao_job", {
      p_id: job.id,
      p_worker_id: workerId,
      p_erro: erro instanceof Error ? erro.message : "provider_indisponivel",
      p_terminal: !erroDeConfiguracao,
    });
    return json({
      ok: true,
      processado: 0,
      motivo: erroDeConfiguracao
        ? "configuracao_provider_invalida"
        : "provider_indisponivel",
    });
  }

  const classificacao = classificarRespostaProvider(
    resultado.statusHttp,
    resultado.payload,
  );

  // "incerto" e TERMINAL: nao se sabe se chegou, e repetir e o unico erro
  // que nao da para desfazer com um ex-aluno.
  if (classificacao.tipo !== "sucesso") {
    await supabase.rpc("falhar_repescagem_evasao_job", {
      p_id: job.id,
      p_worker_id: workerId,
      p_erro: sanitizarErroProvider(resultado.statusHttp),
      p_terminal: classificacao.tipo === "incerto",
    });
    return json({ ok: true, processado: 0, motivo: classificacao.tipo });
  }

  const providerMessageId = classificacao.providerMessageId;

  // 6. Registra a saida e fecha a linha. A mensagem ja foi aceita pelo
  // provider neste ponto: mesmo que o registro falhe, o job precisa ser
  // concluido (nunca reenviar so por causa de um erro de auditoria).
  const { error: erroRegistro } = await supabase
    .from("pesquisa_evasao_mensagens").insert({
      pesquisa_id: job.pesquisa_id,
      caixa_id: Number(pesquisa.caixa_id),
      direcao: "saida",
      tipo: "texto",
      texto: mensagem,
      telefone_normalizado: soDigitos(telefoneDestino),
      provider_message_id: providerMessageId,
      resolution_status: "resolvida",
    });
  if (erroRegistro) {
    console.error(
      "processar-fila-repescagem-evasao: falha ao registrar mensagem de saida",
      { pesquisaId: job.pesquisa_id, erro: erroRegistro.message },
    );
  }

  await supabase.rpc("concluir_repescagem_evasao_job", {
    p_id: job.id,
    p_worker_id: workerId,
    p_provider_message_id: providerMessageId,
  });

  return json({ ok: true, processado: 1, publico });
});
