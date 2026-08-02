// @ts-nocheck

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUazapiCredentials } from "../_shared/uazapi.ts";
import {
  autenticarServiceRole,
  ErroTranscricao,
  processarTranscricao,
  validarPedidoTranscricao,
} from "./contract.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET_PRIVADO = "crm-midia";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extensao(contentType: string): string {
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("mp4")) return "m4a";
  return "mp3";
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "metodo_nao_permitido" }, 405);
  }
  if (
    !autenticarServiceRole(req.headers.get("authorization"), SERVICE_ROLE_KEY)
  ) {
    return json({ error: "nao_autorizado" }, 401);
  }

  let mensagemId: string;
  try {
    mensagemId = validarPedidoTranscricao(await req.json());
  } catch {
    return json({ error: "pedido_invalido" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const repositorio = {
    async carregarMensagem(id: string) {
      const { data, error } = await supabase
        .from("pesquisa_evasao_mensagens")
        .select(
          "id,pesquisa_id,caixa_id,provider_message_id,tipo,audio_storage_path",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw new ErroTranscricao("mensagem_nao_encontrada");
      return data
        ? {
          mensagemId: data.id,
          pesquisaId: data.pesquisa_id,
          caixaId: data.caixa_id,
          providerMessageId: data.provider_message_id,
          tipo: data.tipo,
          audioStoragePath: data.audio_storage_path,
        }
        : null;
    },
    async buscarUltima(id: string) {
      const { data, error } = await supabase
        .from("pesquisa_evasao_transcricoes")
        .select("id,versao,status,texto")
        .eq("mensagem_id", id)
        .order("versao", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async criarPendente(id: string, versao: number) {
      const { data, error } = await supabase
        .from("pesquisa_evasao_transcricoes")
        .insert({ mensagem_id: id, versao, status: "pendente" })
        .select("id,versao,status,texto")
        .single();
      if (error) throw error;
      return data;
    },
    async claimPendente(id: string) {
      const { data, error } = await supabase
        .from("pesquisa_evasao_transcricoes")
        .update({ status: "processando" })
        .eq("id", id)
        .eq("status", "pendente")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async concluir(id: string, texto: string) {
      const { error } = await supabase
        .from("pesquisa_evasao_transcricoes")
        .update({
          status: "concluida",
          texto,
          erro_codigo: null,
          concluido_em: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "processando");
      if (error) throw error;
    },
    async falhar(id: string, codigo: string) {
      const { error } = await supabase
        .from("pesquisa_evasao_transcricoes")
        .update({
          status: "falhou",
          erro_codigo: codigo,
          concluido_em: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "processando");
      if (error) throw error;
    },
    async atualizarStoragePath(id: string, path: string) {
      const { error } = await supabase
        .from("pesquisa_evasao_mensagens")
        .update({ audio_storage_path: path })
        .eq("id", id)
        .is("audio_storage_path", null);
      if (error) throw error;
    },
    async atualizarSubstantividade(id: string, valor: string) {
      const { error } = await supabase
        .from("pesquisa_evasao_mensagens")
        .update({ substantividade: valor })
        .eq("id", id)
        .eq("tipo", "audio");
      if (error) throw error;
    },
  };

  try {
    const resultado = await processarTranscricao(
      mensagemId,
      repositorio,
      {
        async obterDoProvedor(contexto) {
          const creds = await getUazapiCredentials(supabase, {
            caixaId: contexto.caixaId,
          });
          const response = await fetch(`${creds.baseUrl}/message/download`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              token: creds.token,
            },
            body: JSON.stringify({
              id: contexto.providerMessageId,
              transcribe: true,
              generate_mp3: true,
              return_link: true,
            }),
          });
          if (!response.ok) {
            throw new ErroTranscricao("provedor_indisponivel");
          }
          const body = await response.json();
          const mediaUrl = body.fileURL ?? body.fileUrl ?? body.url;
          if (typeof mediaUrl !== "string" || mediaUrl.length === 0) {
            throw new ErroTranscricao("midia_indisponivel");
          }
          const mediaResponse = await fetch(mediaUrl);
          if (!mediaResponse.ok) {
            throw new ErroTranscricao("midia_indisponivel");
          }
          return {
            texto: typeof body.transcription === "string"
              ? body.transcription
              : null,
            arquivo: new Uint8Array(await mediaResponse.arrayBuffer()),
            contentType: mediaResponse.headers.get("content-type") ??
              "audio/mpeg",
          };
        },
        async salvarPrivado(contexto, midia) {
          const pasta = contexto.pesquisaId ?? "sem-pesquisa";
          const path = `pesquisa-evasao/${pasta}/${contexto.mensagemId}.${
            extensao(midia.contentType)
          }`;
          const { error } = await supabase.storage.from("crm-midia").upload(
            path,
            midia.arquivo,
            { contentType: midia.contentType, upsert: false },
          );
          if (
            error && !String(error.message).toLowerCase().includes("duplicate")
          ) {
            throw new ErroTranscricao("storage_falhou");
          }
          return path;
        },
      },
    );
    return json(resultado);
  } catch (error) {
    const codigo = error instanceof ErroTranscricao
      ? error.codigo
      : "erro_interno";
    const status = codigo === "mensagem_nao_encontrada" ? 404 : 422;
    return json({ error: codigo }, status);
  }
});
