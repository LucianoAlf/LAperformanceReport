/// <reference lib="deno.ns" />
// Porta HTTP do orçamento de atenção, para agente que NÃO vive neste banco.
//
// 🔴 POR QUE EXISTE. O teto (`agente_pode_falar_v1`) conta quantas mensagens uma
//    pessoa já recebeu hoje, somando TODOS os agentes. Fábio, Mila e Lia moram
//    neste projeto e chamam a RPC direto. O **TOM está em outro projeto
//    Supabase** e não alcança daqui — sem esta edge, ele ficaria de fora da
//    conta e o teto contaria três de quatro, que é pior que não ter teto:
//    daria a sensação de proteção sem a proteção.
//
// ⚠️ DUAS OPERAÇÕES, e a ordem importa no chamador:
//      GET  ?destino=...&peso=nudge   → posso falar?
//      POST {agente,destino,tipo,peso} → registra o que MANDEI
//    Perguntar depois de mandar não protege ninguém.
//
// ⚠️ `essencial` NUNCA é barrado — nem aqui, nem na RPC. Um teto que silencia
//    "sua aula foi cancelada" não é proteção, é falha.
//
// ⚠️ `verify_jwt = false` porque quem chama é agente de outro projeto, sem JWT
//    de usuário. A porta é o token `orcamento_atencao` em `integracao_tokens`
//    (RLS ligada, zero policies: só service_role alcança), conferido em tempo
//    constante DENTRO da função — a anon key é pública e não serve de porta.
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

/** Comparação em tempo constante: sem isto a latência do `!==` vaza o prefixo. */
function tokensBatem(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const oferecido = req.headers.get("x-agente-token") ?? url.searchParams.get("token") ?? "";

  const { data: cofre } = await sb.from("integracao_tokens")
    .select("token").eq("nome", "orcamento_atencao").maybeSingle();
  if (!cofre?.token) return json({ error: "token_nao_configurado" }, 500);
  if (!tokensBatem(oferecido, cofre.token)) return new Response("unauthorized", { status: 401 });

  if (req.method === "GET") {
    const destino = url.searchParams.get("destino") ?? "";
    const peso = url.searchParams.get("peso") ?? "nudge";
    if (!destino) return json({ ok: false, motivo: "destino_obrigatorio" }, 400);
    const { data, error } = await sb.rpc("agente_pode_falar_v1", {
      p_destino: destino, p_peso: peso,
      p_agente: url.searchParams.get("agente") ?? "externo",
    });
    if (error) return json({ ok: false, erro: error.message }, 500);
    return json(data);
  }

  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    if (!b?.agente || !b?.destino) {
      return json({ ok: false, motivo: "agente_e_destino_obrigatorios" }, 400);
    }
    const { data, error } = await sb.rpc("agente_registrar_mensagem_v1", {
      p_agente: String(b.agente), p_destino: String(b.destino),
      p_tipo: b.tipo ? String(b.tipo) : null,
      p_peso: b.peso ? String(b.peso) : "essencial",
    });
    if (error) return json({ ok: false, erro: error.message }, 500);
    return json(data);
  }

  return json({ error: "metodo_nao_suportado" }, 405);
});
