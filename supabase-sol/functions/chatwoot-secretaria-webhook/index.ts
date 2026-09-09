import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Segredo compartilhado: protege a URL publica do webhook (Chatwoot nao manda JWT).
// Configurar no Chatwoot a URL com ?secret=<este valor>.
const WEBHOOK_SECRET = "7aad31e34eb748a3a64eb451f113d0d2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * 🔴 O ESPELHO PRECISA SABER QUANDO A EQUIPE ENCERRA A CONVERSA (09/09/2026).
 *
 * Até aqui esta funcao descartava tudo que nao fosse `message_created` numa
 * linha, e o status que as views de atendimento filtram saia de dentro do
 * payload da ULTIMA MENSAGEM — congelado ali. Conversa resolvida depois dela
 * seguia candidata a sinal para sempre.
 *
 * Custo medido: a Debora (conv 20184) cobrada na pauta por 14 dias com a
 * conversa encerrada, e a Daiana mandada "entrar agora" no Henrique Supriano
 * (conv 20732), tambem `resolved`, na DM das 08:00.
 *
 * RESOLVER e o gesto pelo qual a equipe declara o desfecho — a informacao mais
 * forte que existe sobre "acabou", e e dela mesma.
 */
async function registrarStatus(p: Record<string, unknown>) {
  const conv = (p?.conversation ?? p) as Record<string, unknown>;
  const conversaId = conv?.id ?? null;
  const status = conv?.status ?? null;
  if (conversaId == null || typeof status !== "string") {
    return { skipped: "sem_conversa_ou_status" };
  }
  const { error } = await supabase
    .from("sol_chatwoot_conversas")
    .upsert({
      conversa_id: Number(conversaId),
      inbox_id: (conv?.inbox_id ?? (p?.inbox as Record<string, unknown>)?.id) ?? null,
      status,
      mudou_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
      fonte: "webhook",
    }, { onConflict: "conversa_id" });
  if (error) {
    console.error("status upsert error", error);
    return { error: error.message };
  }
  return { ok: true, conversa_id: Number(conversaId), status };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-webhook-secret") ?? "";
  if (provided !== WEBHOOK_SECRET) return new Response("unauthorized", { status: 401 });

  if (req.method !== "POST") return json({ ok: true, note: "alive" });

  let p: any;
  try { p = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  // ⚠️ O status vem ANTES da allowlist de inbox de proposito: `conversation_*`
  //    nao carrega `inbox` no mesmo lugar, e um encerramento perdido custa mais
  //    que uma linha a mais nesta tabela (que so guarda id e status).
  if (p?.event === "conversation_status_changed" || p?.event === "conversation_resolved") {
    return json({ evento: p.event, ...(await registrarStatus(p)) });
  }

  if (p?.event !== "message_created") return json({ skipped: "event", event: p?.event });

  const inboxId = p?.inbox?.id ?? p?.conversation?.inbox_id ?? null;
  if (!inboxId) return json({ skipped: "no_inbox" });

  // allowlist (status ativo) — adicionar/remover inbox sem redeploy
  const { data: allowed } = await supabase
    .from("sol_chatwoot_inboxes")
    .select("inbox_id")
    .eq("inbox_id", inboxId)
    .eq("status", "ativo")
    .maybeSingle();
  if (!allowed) return json({ skipped: "inbox_not_allowed", inboxId });

  // ⚠️ Mensagem nova REABRE a conversa no nosso espelho. Sem isto, quem foi
  //    resolvido uma vez ficaria marcado `resolved` para sempre e sumiria da
  //    pauta mesmo voltando a escrever — o falso negativo mais caro que existe
  //    aqui (sumir com cliente que voltou).
  const statusDaConversa = p?.conversation?.status;
  if (typeof statusDaConversa === "string") {
    await registrarStatus(p);
  }

  // message_type pode vir string (incoming/outgoing) ou int (0/1)
  const mt = p?.message_type;
  const isOutgoing = mt === "outgoing" || mt === 1 || mt === "1";
  const isIncoming = mt === "incoming" || mt === 0 || mt === "0";
  if (!isOutgoing && !isIncoming) return json({ skipped: "message_type", mt }); // ignora activity/template
  const autorTipo = isIncoming ? "contact" : "agent";

  const sender = p?.sender ?? {};
  const convSender = p?.conversation?.meta?.sender ?? {};

  const ca = p?.created_at;
  let dataHora: string;
  if (typeof ca === "number") dataHora = new Date(ca * 1000).toISOString();
  else if (typeof ca === "string" && ca) dataHora = new Date(ca).toISOString();
  else dataHora = new Date().toISOString();

  const row = {
    inbox_id: inboxId,
    conversa_id: p?.conversation?.id ?? null,
    contato_id: convSender?.id ?? (autorTipo === "contact" ? sender?.id : null) ?? null,
    contato_nome: convSender?.name ?? null,
    autor_tipo: autorTipo,
    autor_nome: sender?.name ?? null,
    autor_id: sender?.id ?? null,
    texto: p?.content ?? null,
    tipo: p?.content_type ?? "text",
    message_id: p?.id != null ? String(p.id) : null,
    data_hora: dataHora,
    raw: p,
  };

  const { error } = await supabase
    .from("sol_chatwoot_mensagens")
    .upsert(row, { onConflict: "message_id", ignoreDuplicates: true });

  if (error) {
    console.error("insert error", error);
    return json({ error: error.message }, 500);
  }
  return json({ ok: true, inbox_id: inboxId, autor_tipo: autorTipo, message_id: row.message_id });
});
