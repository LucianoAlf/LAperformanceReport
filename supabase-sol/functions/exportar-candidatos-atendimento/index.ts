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
// 🔴 O TETO DO CALOR PRECISA COBRIR A VIEW INTEIRA (09/09/2026).
//
// `fonte=calor` nao paga token nenhum — quem consome e um detector SQL. E com
// foto truncada o consumidor NAO PODE concluir que quem sumiu foi resolvido:
// a view tem 1.452 linhas e o teto de 500 deixava 952 fora, entao a conversa
// encerrada abaixo do corte ficava viva para sempre no estado (caso Hetiene,
// conv 20181, presa desde 08/09). Com a foto completa, "sumiu" volta a ser
// prova, e a marca d'agua do consumidor cobre 100% em vez de uma fatia.
//
// ⚠️ O teto semantico continua 500 DE PROPOSITO: la cada linha vira chamada de
//    OpenAI, e o custo e o limite certo.
// ⚠️ 1.000 e o TETO DO POSTGREST (`max-rows`), nao uma escolha: pedir 3.000
//    devolvia 1.000 do mesmo jeito e fazia o flag `truncado` MENTIR — ele
//    compara `total >= limite`, entao com limite 3.000 e 1.000 linhas ele
//    diria "foto completa" com 452 conversas de fora. O consumidor confia
//    nesse flag para decidir se pode concluir por ausencia.
const TETO_CALOR = 1000;

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

  const ehCalor = url.searchParams.get("fonte") === "calor";
  const teto = ehCalor ? TETO_CALOR : TETO_LINHAS;
  const limite = Math.min(
    Number(url.searchParams.get("limite") ?? teto) || teto,
    teto,
  );
  const departamento = url.searchParams.get("departamento");

  // `fonte=calor` (T2, 04/09) devolve os FATOS estruturais da conversa
  // (chegou a humano? quanto demorou? preso no bot?) em vez dos candidatos a
  // leitura semantica. Mesmo token, mesmo formato de envelope — o consumidor
  // troca so o parametro. Nao virou edge nova de proposito: seria um 2o
  // transporte com a mesma porta e a mesma auth para manter em dois lugares.
  const fonte = ehCalor
    ? "vw_atendimento_calor_conversa"
    : "vw_atendimento_candidatos_sinal";

  let q = supabase
    .from(fonte)
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
    fonte,
    total: data?.length ?? 0,
    truncado: (data?.length ?? 0) >= limite,
    candidatos: data ?? [],
  });
});
