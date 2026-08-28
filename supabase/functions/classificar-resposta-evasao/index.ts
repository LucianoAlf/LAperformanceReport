/// <reference lib="deno.ns" />
// Classificador semântico das respostas da pesquisa de evasão.
//
// O QUE ELE **NÃO** FAZ (de propósito):
//   - não altera `pesquisa_evasao.resposta_status` nem qualquer registro;
//   - não envia mensagem nenhuma;
//   - não tem veto sobre o que já é registrado como resposta.
// O registro continua com a regra permissiva de sempre (>= 3 palavras). Dar veto
// ao modelo trocaria um erro barato (registrar lixo, que a revisão descarta) por
// um caro (perder feedback de verdade). Ele é OBSERVADOR e insumo do futuro
// agradecimento -- que nasce desligado.
//
// O QUE ELE FAZ: grava a opinião dele em `automacao_log`
// (`acao='classificacao_ia_evasao'`), COM o texto avaliado junto -- sem o texto
// a auditoria é impossível: semanas depois "achou que não era resposta" não diz
// se acertou.
//
// Sem tabela nova (decisão do Hugo, 27/08): `automacao_log` já é onde o projeto
// registra o que as automações fizeram.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import {
  chaveIdempotencia,
  decidirAgradecimento,
  statusDoLog,
  type VeredictoModelo,
} from "./contract.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODELO = "gpt-5.4-mini-2026-03-17";
const PROMPT_VERSAO = "v2";

const SYSTEM =
  `Você analisa mensagens recebidas por WhatsApp na caixa "Sucesso do Aluno" de uma escola de música.

CONTEXTO FIXO: quem escreve é um EX-ALUNO (ou o responsável por ele) que JÁ SAIU
da escola. Dias atrás ele recebeu esta pergunta sobre a saída:
"Se você pudesse mudar alguma coisa aqui na LA para que a experiência fosse melhor, o que você mudaria?"

Decida se a MENSAGEM DELE responde a essa pergunta.

CONTA como resposta — inclusive quando for curta ou telegráfica:
- avaliação da experiência que ele TEVE ("não mudaria nada", "foi ótimo", "muito caro")
- crítica, elogio ou sugestão de melhoria, mesmo em poucas palavras
  (ex.: "Atenção com o aprendizado do aluno" é uma sugestão -> É resposta)
- explicação do motivo da saída (preço, horário, distância, desinteresse, mudança)
- mensagem que começa com saudação e depois responde
- resposta fragmentada: julgue o texto que recebeu, mesmo sendo um pedaço

NÃO conta como resposta:
- promessa de responder depois ("mando mais tarde", "respondo amanhã", "já já respondo")
- só saudação ou cortesia, sem conteúdo ("bom dia", "obrigada", "tudo bem?")
- assunto administrativo: avisar falta, remarcar aula, pedir chave Pix, segunda via,
  perguntar preço, perguntar como funciona
- mensagem sobre aula FUTURA ou sobre começar/voltar a estudar — quem respondeu
  já saiu, então isso é outro assunto (ou outro aluno da família)
- pedido para não receber mais mensagens
- mensagem automática de outra empresa

Seja conservador na confiança: "alta" só quando não houver dúvida razoável.
Na dúvida entre "média" e "alta", escolha "média".

O motivo deve ter no máximo uma frase curta, em português.`;

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "e_resposta",
    "confianca",
    "motivo",
    "contem_pergunta",
    "pede_atendimento_humano",
  ],
  properties: {
    e_resposta: { type: "boolean" },
    confianca: { type: "string", enum: ["alta", "media", "baixa"] },
    motivo: { type: "string" },
    contem_pergunta: {
      type: "boolean",
      description: "A pessoa fez alguma pergunta que espera retorno?",
    },
    pede_atendimento_humano: {
      type: "boolean",
      description:
        "Está cobrando algo, irritada, ou pedindo para falar com alguém?",
    },
  },
} as const;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function chaveOpenAI(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from("assistente_ia_config")
    .select("openai_api_key")
    .limit(1)
    .single();
  return data?.openai_api_key ?? Deno.env.get("OPENAI_API_KEY") ?? "";
}

async function classificar(
  texto: string,
  apiKey: string,
): Promise<VeredictoModelo> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODELO,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: "Mensagem recebida:\n" + texto },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "classificacao_resposta_evasao",
          strict: true,
          schema,
        },
      },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error("OpenAI: " + JSON.stringify(data.error));
  return JSON.parse(data.choices?.[0]?.message?.content || "{}");
}

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "metodo_nao_permitido" }, 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Mesmo padrão da fila de repescagem: o token vive no vault e é validado no
  // banco, nunca em env var (env inexistente = 401 silencioso com o pg_cron
  // marcando `succeeded`).
  // Dois chamadores legitimos, duas formas:
  //   `x-sync-token` -> chamada manual/cron (validado NO BANCO, nunca em env);
  //   service_role no Authorization -> `functions.invoke` de outra edge, que e
  //   como `processar-conversa-evasao` ja chama `transcrever-mensagem-evasao`.
  const token = req.headers.get("x-sync-token");
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
  let autorizado = bearer !== "" && bearer === SERVICE_ROLE_KEY;
  if (!autorizado && token) {
    const { data: tokenOk, error: erroToken } = await supabase.rpc(
      "validar_token_sync_presenca_interno_v1",
      { p_token: token },
    );
    autorizado = !erroToken && tokenOk === true;
  }
  if (!autorizado) return json({ error: "nao_autorizado" }, 401);

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "pedido_invalido" }, 400);
  }

  const texto = String(corpo.texto ?? "").trim();
  if (!texto) return json({ error: "texto_obrigatorio" }, 400);

  const pesquisaId = corpo.pesquisa_id ? String(corpo.pesquisa_id) : null;
  const analiseVersao = Number(corpo.analise_versao ?? 0);
  const registradoComoResposta = Boolean(corpo.registrado_como_resposta ?? false);
  // `gravar=false` é o modo de calibração: classifica e devolve, sem sujar o log
  // com a massa histórica que estou usando só para medir acerto.
  const gravar = corpo.gravar !== false;

  const apiKey = await chaveOpenAI(supabase);
  if (!apiKey) return json({ error: "sem_chave_openai" }, 503);

  let veredicto: VeredictoModelo;
  try {
    veredicto = await classificar(texto, apiKey);
  } catch (erro) {
    console.error("classificar-resposta-evasao: modelo falhou", {
      pesquisaId,
      erro: erro instanceof Error ? erro.message : "desconhecido",
    });
    return json({ error: "classificacao_indisponivel" }, 502);
  }

  const agradecimento = decidirAgradecimento(veredicto);
  const status = statusDoLog(veredicto, registradoComoResposta);

  if (gravar && pesquisaId) {
    const { data: pesquisa } = await supabase
      .from("pesquisa_evasao")
      .select("aluno_id, aluno_nome, unidade_id, unidades(nome)")
      .eq("id", pesquisaId)
      .maybeSingle();

    const { error: erroLog } = await supabase.from("automacao_log").insert({
      evento: "pesquisa_evasao",
      acao: "classificacao_ia_evasao",
      status,
      aluno_id: pesquisa?.aluno_id ?? null,
      aluno_nome: pesquisa?.aluno_nome ?? null,
      unidade_nome:
        (pesquisa as { unidades?: { nome?: string } } | null)?.unidades?.nome ??
          null,
      idempotency_key: chaveIdempotencia(pesquisaId, analiseVersao, PROMPT_VERSAO),
      detalhes: {
        pesquisa_id: pesquisaId,
        analise_versao: analiseVersao,
        // O texto julgado viaja junto: sem ele a auditoria não é possível.
        texto_avaliado: texto,
        registrado_como_resposta: registradoComoResposta,
        ...veredicto,
        ...agradecimento,
        modelo: MODELO,
        prompt_versao: PROMPT_VERSAO,
      },
    });
    // Log é secundário ao veredito: falha aqui não pode derrubar a resposta,
    // mas não pode sumir em silêncio (é a única pista da auditoria).
    if (erroLog) {
      console.error("classificar-resposta-evasao: falha ao gravar log", {
        pesquisaId,
        erro: erroLog.message,
      });
    }
  }

  return json({
    ok: true,
    ...veredicto,
    ...agradecimento,
    status,
    modelo: MODELO,
    prompt_versao: PROMPT_VERSAO,
  });
});
