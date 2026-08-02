// @ts-nocheck

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  autenticarWorkerInterno,
  type ConversaParaConsolidar,
  decidirConsolidacao,
  listarMensagensComTranscricaoPendente,
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

function menorDataIso(atual: string | null, candidata: string): string {
  if (!atual) return candidata;
  return Date.parse(candidata) < Date.parse(atual) ? candidata : atual;
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
      const [{ data: pesquisa, error: pesquisaError }, analisesResult] =
        await Promise.all([
          supabase.from("pesquisa_evasao")
            .select("id,enviado_em,resposta_status")
            .eq("id", pesquisaId)
            .eq("resposta_ingestao_versao", "multipartes_v2")
            .maybeSingle(),
          supabase.from("pesquisa_evasao_analises")
            .select("id,versao,status,encerrada_em")
            .eq("pesquisa_id", pesquisaId)
            .order("versao", { ascending: true }),
        ]);

      if (pesquisaError || analisesResult.error) {
        throw new Error("conversa_indisponivel");
      }
      if (!pesquisa) {
        await supabase.from("pesquisa_evasao_processamento")
          .delete().eq("pesquisa_id", pesquisaId).eq("locked_by", workerId);
        continue;
      }

      const analises = analisesResult.data ?? [];
      const rascunhos = analises.filter((item) => item.status === "rascunho");
      const ultimaVersao = analises.at(-1)?.versao ?? 0;
      const existeRevisada = analises.some((item) => item.status === "revisada");
      let proximaExecucaoEm: string | null = null;

      for (const analise of rascunhos) {
        const { data: mensagens, error: mensagensError } = await supabase
          .from("pesquisa_evasao_mensagens")
          .select(
            "id,tipo,texto,substantividade,provider_created_at,recebido_em,criado_em",
          )
          .eq("pesquisa_id", pesquisaId)
          .eq("analise_versao", analise.versao)
          .eq("direcao", "entrada")
          .eq("resolution_status", "resolvida");
        if (mensagensError) throw new Error("mensagens_indisponiveis");

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
          ultimaAnalise: { versao: analise.versao, status: analise.status },
          mensagens: mensagensContrato,
        };

        for (
          const mensagemId of listarMensagensComTranscricaoPendente(
            mensagensContrato,
          )
        ) {
          const { error } = await supabase.functions.invoke(
            "transcrever-mensagem-evasao",
            {
              body: { mensagem_id: mensagemId },
              headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
            },
          );
          if (error) throw new Error("transcricao_disparo_falhou");
        }

        const decisao = decidirConsolidacao(conversa, new Date());
        if (decisao.acao === "aguardar") {
          proximaExecucaoEm = menorDataIso(
            proximaExecucaoEm,
            decisao.proximaExecucaoEm,
          );
          continue;
        }
        if (decisao.acao === "ignorar") continue;

        if (decisao.acao === "expirar") {
          if (analise.versao === ultimaVersao) {
            const { error } = await supabase.from("pesquisa_evasao")
              .update({ resposta_status: "expirada" })
              .eq("id", pesquisaId)
              .eq("resposta_ingestao_versao", "multipartes_v2");
            if (error) throw new Error("expiracao_falhou");
          }
          continue;
        }

        const pronta = decisao.respostaStatus === "pronta_para_revisao";
        const { data: analiseAtualizada, error: analiseError } = await supabase
          .from("pesquisa_evasao_analises")
          .update({
            texto_consolidado: decisao.textoConsolidado,
            status: pronta ? "pronta_para_revisao" : "rascunho",
            encerrada_em: decisao.encerradaEm,
          })
          .eq("id", analise.id)
          .eq("status", "rascunho")
          .select("id")
          .maybeSingle();
        if (analiseError || !analiseAtualizada) {
          throw new Error("analise_falhou");
        }

        if (analise.versao === ultimaVersao) {
          const agoraIso = new Date().toISOString();
          const patch: Record<string, unknown> = {
            status: pronta || existeRevisada ? "respondido" : "enviado",
            resposta_status: decisao.respostaStatus,
            resposta_valida: pronta,
            resposta_texto: decisao.textoConsolidado,
            resposta_tipo: decisao.respostaTipo,
          };
          if (pronta) {
            patch.respondido_em = agoraIso;
            patch.pronta_para_revisao_em = agoraIso;
          }
          const { error: cabecalhoError } = await supabase
            .from("pesquisa_evasao")
            .update(patch)
            .eq("id", pesquisaId)
            .eq("resposta_ingestao_versao", "multipartes_v2");
          if (cabecalhoError) throw new Error("cabecalho_falhou");
        }

        if (decisao.proximaExecucaoEm) {
          proximaExecucaoEm = menorDataIso(
            proximaExecucaoEm,
            decisao.proximaExecucaoEm,
          );
        }
      }

      if (proximaExecucaoEm) {
        const { error } = await supabase.from("pesquisa_evasao_processamento")
          .update({
            executar_apos: proximaExecucaoEm,
            motivo: "aguardando_rodada",
            locked_at: null,
            locked_by: null,
            ultimo_erro: null,
            updated_at: new Date().toISOString(),
          }).eq("pesquisa_id", pesquisaId).eq("locked_by", workerId);
        if (error) throw new Error("reagendamento_falhou");
      } else {
        await supabase.from("pesquisa_evasao_processamento")
          .delete().eq("pesquisa_id", pesquisaId).eq("locked_by", workerId);
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
