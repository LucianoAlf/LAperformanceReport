// @ts-nocheck

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  autenticarWorkerInterno,
  type ConversaParaConsolidar,
  decidirConsolidacao,
  type MensagemDaConversa,
} from "./contract.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_TOKEN =
  Deno.env.get("SYNC_PRESENCA_EDGE_TOKEN")?.trim() ||
  Deno.env.get("SYNC_MATRICULAS_ADMIN_TOKEN")?.trim() ||
  "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "metodo_nao_permitido" }, 405);
  }
  if (!autenticarWorkerInterno(req.headers.get("x-sync-token"), WORKER_TOKEN)) {
    return json({ error: "nao_autorizado" }, 401);
  }

  let limite = 25;
  try {
    const body = await req.json();
    if (body?.limite !== undefined) limite = Number(body.limite);
  } catch {
    return json({ error: "pedido_invalido" }, 400);
  }
  if (!Number.isInteger(limite) || limite < 1 || limite > 50) {
    return json({ error: "limite_invalido" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const workerId = crypto.randomUUID();
  const { data: claims, error: claimError } = await supabase.rpc(
    "claim_pesquisas_evasao_processamento",
    { p_worker_id: workerId, p_limite: limite },
  );
  if (claimError) return json({ error: "claim_falhou" }, 503);

  let processadas = 0;
  let falhas = 0;
  for (const claim of claims ?? []) {
    const pesquisaId = claim.pesquisa_id;
    try {
      const { data: pesquisa, error: pesquisaError } = await supabase
        .from("pesquisa_evasao")
        .select("id,enviado_em,resposta_status")
        .eq("id", pesquisaId)
        .eq("resposta_ingestao_versao", "multipartes_v2")
        .maybeSingle();
      if (pesquisaError) throw new Error("pesquisa_indisponivel");
      if (!pesquisa) {
        await supabase.from("pesquisa_evasao_processamento")
          .delete().eq("pesquisa_id", pesquisaId).eq("locked_by", workerId);
        continue;
      }

      const [{ data: mensagens, error: mensagensError }, analiseResult] =
        await Promise.all([
          supabase.from("pesquisa_evasao_mensagens")
            .select(
              "id,tipo,texto,substantividade,provider_created_at,recebido_em,criado_em",
            )
            .eq("pesquisa_id", pesquisaId)
            .eq("direcao", "entrada")
            .eq("resolution_status", "resolvida"),
          supabase.from("pesquisa_evasao_analises")
            .select("versao,status")
            .eq("pesquisa_id", pesquisaId)
            .order("versao", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
      if (mensagensError || analiseResult.error) {
        throw new Error("conversa_indisponivel");
      }

      const ids = (mensagens ?? []).map((item) => item.id);
      const transcricoesResult = ids.length > 0
        ? await supabase.from("pesquisa_evasao_transcricoes")
          .select("mensagem_id,versao,status,texto")
          .in("mensagem_id", ids)
        : { data: [], error: null };
      if (transcricoesResult.error) {
        throw new Error("transcricoes_indisponiveis");
      }

      const transcricoesPorMensagem = new Map<string, unknown[]>();
      for (const item of transcricoesResult.data ?? []) {
        const lista = transcricoesPorMensagem.get(item.mensagem_id) ?? [];
        lista.push(item);
        transcricoesPorMensagem.set(item.mensagem_id, lista);
      }
      const mensagensContrato: MensagemDaConversa[] = (mensagens ?? []).map(
        (item) => ({
          id: item.id,
          tipo: item.tipo,
          texto: item.texto,
          substantividade: item.substantividade,
          providerCreatedAt: item.provider_created_at,
          recebidoEm: item.recebido_em,
          criadoEm: item.criado_em,
          transcricoes: transcricoesPorMensagem.get(item.id) ?? [],
        }),
      );
      const conversa: ConversaParaConsolidar = {
        pesquisaId,
        enviadoEm: pesquisa.enviado_em,
        respostaStatus: pesquisa.resposta_status,
        ultimaAnalise: analiseResult.data,
        mensagens: mensagensContrato,
      };
      const decisao = decidirConsolidacao(conversa, new Date());

      if (decisao.acao === "ignorar") {
        await supabase.from("pesquisa_evasao_processamento")
          .delete().eq("pesquisa_id", pesquisaId).eq("locked_by", workerId);
      } else if (decisao.acao === "expirar") {
        const { error } = await supabase.from("pesquisa_evasao")
          .update({ resposta_status: "expirada" }).eq("id", pesquisaId)
          .eq("resposta_ingestao_versao", "multipartes_v2");
        if (error) throw new Error("expiracao_falhou");
        await supabase.from("pesquisa_evasao_processamento")
          .delete().eq("pesquisa_id", pesquisaId).eq("locked_by", workerId);
      } else if (decisao.acao === "aguardar") {
        const { error } = await supabase.from("pesquisa_evasao_processamento")
          .update({
            executar_apos: decisao.proximaExecucaoEm,
            motivo: "aguardando_janela",
            locked_at: null,
            locked_by: null,
            ultimo_erro: null,
            updated_at: new Date().toISOString(),
          }).eq("pesquisa_id", pesquisaId).eq("locked_by", workerId);
        if (error) throw new Error("reagendamento_falhou");
      } else {
        const { data: versao, error: versaoError } = await supabase.rpc(
          "preparar_nova_analise_pesquisa_evasao",
          { p_pesquisa_id: pesquisaId },
        );
        if (versaoError) throw new Error("versao_analise_falhou");
        const { error: analiseError } = await supabase
          .from("pesquisa_evasao_analises")
          .upsert({
            pesquisa_id: pesquisaId,
            versao: Number(versao),
            texto_consolidado: decisao.textoConsolidado,
            status: "rascunho",
          }, { onConflict: "pesquisa_id,versao" });
        if (analiseError) throw new Error("analise_falhou");

        const pronta = decisao.respostaStatus === "pronta_para_revisao";
        const { error: cabecalhoError } = await supabase
          .from("pesquisa_evasao")
          .update({
            status: pronta ? "respondido" : "enviado",
            resposta_status: decisao.respostaStatus,
            resposta_valida: pronta,
            resposta_texto: decisao.textoConsolidado,
            resposta_tipo: decisao.respostaTipo,
            respondido_em: pronta ? new Date().toISOString() : null,
            pronta_para_revisao_em: pronta ? new Date().toISOString() : null,
          })
          .eq("id", pesquisaId)
          .eq("resposta_ingestao_versao", "multipartes_v2");
        if (cabecalhoError) throw new Error("cabecalho_falhou");

        if (pronta) {
          await supabase.from("pesquisa_evasao_processamento")
            .delete().eq("pesquisa_id", pesquisaId).eq("locked_by", workerId);
        } else {
          await supabase.from("pesquisa_evasao_processamento").update({
            executar_apos: decisao.proximaExecucaoEm,
            motivo: "aguardando_revisao",
            locked_at: null,
            locked_by: null,
            ultimo_erro: null,
            updated_at: new Date().toISOString(),
          }).eq("pesquisa_id", pesquisaId).eq("locked_by", workerId);
        }
      }
      processadas += 1;
    } catch {
      falhas += 1;
      await supabase.from("pesquisa_evasao_processamento").update({
        executar_apos: new Date(Date.now() + 5 * 60_000).toISOString(),
        motivo: "retry",
        locked_at: null,
        locked_by: null,
        ultimo_erro: "processamento_falhou",
        updated_at: new Date().toISOString(),
      }).eq("pesquisa_id", pesquisaId).eq("locked_by", workerId);
    }
  }

  return json({ claimed: (claims ?? []).length, processadas, falhas });
});
