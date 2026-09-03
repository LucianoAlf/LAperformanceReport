/// <reference lib="deno.ns" />
// Projeto: SOL (bvltexmlmydsncfjstbr). Edge de TRANSPORTE — nao decide nada.
//
// Devolve `vw_atendimento_candidatos_sinal`: conversas do Chatwoot em que o
// cliente falou por ultimo e ninguem respondeu. Quem interpreta e o extrator
// semantico no LA REPORT (`extrair-sinais-conversa`), porque e la que moram
// `alunos`/`leads` (para resolver o telefone) e a chave da OpenAI.
//
// POR QUE UMA EDGE E NAO A VIEW DIRETO PELO POSTGREST: ler a view pelo PostgREST
// exigiria GRANT SELECT para `anon`, e a anon key e publica — conversa de aluno
// e de lead ficaria legivel por qualquer um. Mesmo motivo da edge
// `base-conhecimento` no LA Report.
//
// O token fica em `integracao_tokens` (RLS ligada, zero policies: so
// service_role alcanca). Rotacionar = UPDATE nos DOIS projetos, sem redeploy.

import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TETO_LINHAS = 500;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Comparacao em tempo constante: sem isto, a latencia do `!==` vaza o prefixo. */
function tokensBatem(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const oferecido = req.headers.get("x-radar-token") ??
    url.searchParams.get("token") ?? "";

  const { data: cofre } = await supabase
    .from("integracao_tokens")
    .select("token")
    .eq("nome", "radar_export")
    .maybeSingle();

  if (!cofre?.token) return json({ error: "token_nao_configurado" }, 500);
  if (!tokensBatem(oferecido, cofre.token)) {
    return new Response("unauthorized", { status: 401 });
  }

  const limite = Math.min(
    Number(url.searchParams.get("limite") ?? TETO_LINHAS) || TETO_LINHAS,
    TETO_LINHAS,
  );
  const departamento = url.searchParams.get("departamento");

  let q = supabase
    .from("vw_atendimento_candidatos_sinal")
    .select("*")
    .order("ultima_msg_em", { ascending: false })
    .limit(limite);
  if (departamento) q = q.eq("departamento", departamento);

  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);

  // `truncado` existe para o consumidor saber que a foto esta incompleta —
  // silencio aqui viraria "o dia estava calmo" quando o dia estourou o teto.
  return json({
    ok: true,
    gerado_em: new Date().toISOString(),
    total: data?.length ?? 0,
    truncado: (data?.length ?? 0) >= limite,
    candidatos: data ?? [],
  });
});
