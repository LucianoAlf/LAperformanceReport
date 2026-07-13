// Edge Function: classificar-desinteresse
// Classifica o motivo de desinteresse de um lead que esfriou no follow-up do SDR.
//
// Chamada pelo cron da la-hq (followup-cron.sh) quando um lead chega ao estágio 5
// e passa ~24h sem resposta. Recebe o transcript já pronto (o cron tem em mãos),
// roda o LLM (Gemini) em DOIS passos — portão anti-contaminação + motivo — e grava
// o resultado no LA Report. NÃO acessa o Chatwoot (o transcript vem no corpo).
//
// Modos:
//   dry_run=true            -> classifica, tenta o match por telefone, devolve tudo, NÃO grava nada.
//   (default)               -> event-only: grava em crm_lead_historico. NÃO toca em temperatura.
//   write_temperatura=true  -> além do evento, seta leads.temperatura='frio' (só se tipo_registro='lead_frio').
//                              [fase 2, default OFF — ligar só após validar o modo event-only]
//
// Escreve apenas: INSERT em crm_lead_historico (append-only, tipo novo) e,
// opcionalmente, UPDATE leads.temperatura. Nenhuma alteração de schema.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MOTIVOS = [
  "preco", "financeiro", "horario", "distancia", "concorrente",
  "desistiu", "pesquisando", "atendimento", "sem_sinal", "outro",
];
const TIPOS_REGISTRO = ["lead_frio", "agendou_experimental", "invalido", "fora_do_perfil"];

const SYSTEM = `Você analisa conversas de WhatsApp entre a Mila (SDR virtual da LA Music, escola de música no RJ) e um lead que PAROU de responder após 5 follow-ups automáticos.

Sua tarefa tem DOIS passos.

PASSO 1 — PORTÃO. Antes de dizer o motivo, decida o que é essa conversa (tipo_registro):
- "agendou_experimental": a conversa mostra que o lead JÁ agendou/confirmou uma aula experimental (ex.: "Sua Aula Experimental foi marcada", lembretes de aula). NÃO é desinteresse.
- "invalido": número errado, spam, texto sem sentido, ou contato que claramente não é alguém buscando aula.
- "fora_do_perfil": não é o cliente — candidato a emprego (quer mandar currículo), empresa de outro ramo, ou terceiro apenas repassando pra outra pessoa.
- "lead_frio": um lead genuíno, interessado em aula, que esfriou/sumiu. SÓ nesse caso preencha o motivo do passo 2.

PASSO 2 — MOTIVO (só quando tipo_registro = "lead_frio"). Escolha o motivo dominante:
- "preco": achou caro / objeção de valor.
- "financeiro": sem condições de pagar agora (situação, não objeção de valor).
- "horario": horário/agenda incompatível.
- "distancia": longe / localização.
- "concorrente": escolheu outra escola.
- "desistiu": desistiu do objetivo de aprender.
- "pesquisando": só pesquisando preço/opções, sem intenção real.
- "atendimento": travou por atrito no atendimento (ex.: pediu o valor várias vezes, a Mila não deu, e sumiu).
- "sem_sinal": SUMIU sem deixar pista (ghost) — típico de quem parou logo no "qual seu nome?". Use quando NÃO há evidência real de motivo. NUNCA invente motivo.
- "outro": motivo claro que não cabe em nenhum acima.

REGRAS:
- Se não há sinal claro do porquê, use "sem_sinal". É melhor abster do que inventar.
- confianca de 0 a 1 reflete quão claro está o motivo na conversa.
- Pode haver mais de um motivo em motivos[], mas escolha um motivo_principal.
- resumo: uma frase curta em pt-BR explicando a decisão.`;

const responseSchema = {
  type: "object",
  properties: {
    tipo_registro: { type: "string", enum: TIPOS_REGISTRO },
    motivo_principal: { type: "string", enum: MOTIVOS },
    motivos: { type: "array", items: { type: "string", enum: MOTIVOS } },
    confianca: { type: "number" },
    resumo: { type: "string" },
  },
  required: ["tipo_registro", "motivos", "confianca", "resumo"],
};

function onlyDigits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

// Gera variantes do telefone pra casar com leads.telefone/whatsapp (formato '5521999999999').
function phoneVariants(raw: string): string[] {
  let d = onlyDigits(raw).replace(/^0+/, "");
  if (!d) return [];
  const set = new Set<string>([d]);
  if (d.startsWith("55")) set.add(d.slice(2));
  else set.add("55" + d);
  return [...set];
}

async function classify(transcript: string) {
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: "Conversa:\n" + transcript }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema,
    },
  };
  const res = await fetch(GEMINI_URL + "?key=" + GEMINI_API_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error("Gemini: " + JSON.stringify(data.error));
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return JSON.parse(text);
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let payload: any;
  try { payload = await req.json(); } catch { return json({ ok: false, error: "invalid json" }, 400); }

  const conversationId = payload.conversation_id ?? null;
  const phone = payload.phone ?? "";
  const transcript = payload.transcript ?? "";
  const dryRun = payload.dry_run === true;
  const writeTemp = payload.write_temperatura === true;

  if (!transcript || String(transcript).trim().length < 3) {
    return json({ ok: false, error: "transcript vazio" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1. classificar (gate + motivo)
  let cls: any;
  try { cls = await classify(String(transcript)); }
  catch (e) { return json({ ok: false, error: String(e) }, 502); }

  // 2. match do lead por telefone
  let leadId: number | null = null;
  const variants = phoneVariants(phone);
  if (variants.length) {
    const ors = variants.flatMap((v) => [`telefone.eq.${v}`, `whatsapp.eq.${v}`]).join(",");
    const { data: leads } = await supabase.from("leads").select("id").or(ors).limit(1);
    if (leads && leads.length) leadId = leads[0].id as number;
  }

  const result: any = {
    ok: true,
    dry_run: dryRun,
    classificacao: cls,
    lead_id: leadId,
    matched: leadId !== null,
    conversation_id: conversationId,
  };

  if (dryRun) return json(result);

  // 3. gravar (event-only). crm_lead_historico.lead_id é NOT NULL -> precisa de match.
  if (leadId === null) {
    return json({ ...result, gravado: false, motivo_nao_gravou: "sem_match_telefone" });
  }

  // idempotência: já existe evento desse lead pra essa conversa?
  if (conversationId !== null) {
    const { data: existentes } = await supabase
      .from("crm_lead_historico")
      .select("id")
      .eq("lead_id", leadId)
      .eq("tipo", "desinteresse_frio")
      .contains("dados", { conversation_id: conversationId })
      .limit(1);
    if (existentes && existentes.length) {
      return json({ ...result, gravado: false, motivo_nao_gravou: "ja_registrado", historico_id: existentes[0].id });
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from("crm_lead_historico")
    .insert({
      lead_id: leadId,
      tipo: "desinteresse_frio",
      descricao: cls.resumo || "Lead esfriou após follow-ups sem resposta",
      dados: {
        tipo_registro: cls.tipo_registro,
        motivo_principal: cls.motivo_principal ?? null,
        motivos: cls.motivos ?? [],
        confianca: cls.confianca ?? null,
        fonte: "ia",
        modelo: "gemini-3-flash-preview",
        conversation_id: conversationId,
      },
    })
    .select("id")
    .single();
  if (insErr) return json({ ...result, gravado: false, erro_insert: insErr.message }, 500);

  // 4. (fase 2, default OFF) temperatura='frio' só se for lead_frio genuíno
  let tempAtualizada = false;
  if (writeTemp && cls.tipo_registro === "lead_frio") {
    const { error: upErr } = await supabase
      .from("leads")
      .update({ temperatura: "frio" })
      .eq("id", leadId);
    tempAtualizada = !upErr;
  }

  return json({ ...result, gravado: true, historico_id: inserted.id, temperatura_atualizada: tempAtualizada });
});
