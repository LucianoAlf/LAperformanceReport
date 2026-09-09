/// <reference lib="deno.ns" />
// T2 (calor do lead) · 1º ANDAR · camada OPERACIONAL
//
// PARA QUE EXISTE: os campos de calor em `leads` são 100% mortos — desenhados e
// nunca alimentados. O calor tem de sair da CONVERSA, e as conversas moram no
// projeto SOL (`sol_chatwoot_mensagens`). SQL não atravessa projeto: esta edge é
// a ponte.
//
// O QUE FAZ: puxa `vw_atendimento_calor_conversa` (via a MESMA edge de
// transporte já existente, com `?fonte=calor`), grava em
// `atendimento_conversa_estado` e chama o detector da R18.
//
// ⚠️ Reusa a edge de export que já existia em vez de criar um 2º transporte —
// seria a mesma porta e a mesma auth para manter em dois lugares.
//
// ⚠️ Foto vazia ABORTA sem escrever (422). Zero conversa viva é sintoma de
// token/permissão, não de "ninguém falou" — mesma guarda das capturas de mídia.
//
// ⚠️ Idempotente por PK (`conversa_id`). Neste ambiente 1 disparo de cron vira
// 2-4 execuções; rodar 4× é o mesmo que rodar 1×.
//
// ⚠️ O detector roda DEPOIS da ingestão, na mesma invocação, de propósito: dois
// crons independentes deixariam o detector ler foto velha e a ordem viraria
// sorte.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SOL_EXPORT_URL =
  "https://bvltexmlmydsncfjstbr.supabase.co/functions/v1/exportar-candidatos-atendimento";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function tokensBatem(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

type Linha = Record<string, unknown>;

serve(async (req) => {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // porta desta edge
  const { data: cofre } = await sb.from("integracao_tokens")
    .select("token").eq("nome", "radar_extrator").maybeSingle();
  const oferecido = req.headers.get("x-radar-token") ?? "";
  if (!cofre?.token) return json({ error: "token_nao_configurado" }, 500);
  if (!tokensBatem(oferecido, cofre.token)) {
    return new Response("unauthorized", { status: 401 });
  }

  // token de leitura do projeto SOL
  const { data: tokSol } = await sb.from("integracao_tokens")
    .select("token").eq("nome", "sol_radar_export").maybeSingle();
  if (!tokSol?.token) return json({ error: "sol_radar_export_nao_configurado" }, 500);

  let linhas: Linha[] = [];
  try {
    const resp = await fetch(`${SOL_EXPORT_URL}?fonte=calor&limite=1000`, {
      headers: { "x-radar-token": tokSol.token },
    });
    if (!resp.ok) {
      return json({ error: `sol_export_${resp.status}`, corpo: (await resp.text()).slice(0, 200) }, 502);
    }
    const env = await resp.json();
    linhas = (env?.candidatos as Linha[]) ?? [];
    if (env?.fonte !== "vw_atendimento_calor_conversa") {
      // O `?fonte=calor` não pegou (edge da Sol desatualizada). Gravar os
      // candidatos semânticos aqui produziria linha com metade dos campos nulos
      // e a R18 pararia de nascer — em silêncio.
      return json({ error: "fonte_inesperada", fonte: env?.fonte }, 502);
    }
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 502);
  }

  if (linhas.length === 0) {
    return json({ error: "foto_vazia", nota: "nada gravado de proposito" }, 422);
  }

  // unidade vem como TEXTO do lado da Sol ('Campo Grande'|'Recreio'|'Barra');
  // aqui a chave é uuid.
  const { data: unidades } = await sb.from("unidades").select("id, nome");
  const porNome = new Map<string, string>();
  for (const u of unidades ?? []) {
    porNome.set(String(u.nome).trim().toLowerCase(), u.id as string);
  }

  // um carimbo só para a rodada inteira: é ele que separa "veio nesta foto" de
  // "ficou para trás", logo abaixo. Gerar por linha faria a comparação depender
  // da ordem de gravação.
  const carimbo = new Date().toISOString();

  const registros = linhas.map((l) => ({
    conversa_id: Number(l.conversa_id),
    inbox_id: l.inbox_id != null ? Number(l.inbox_id) : null,
    inbox_nome: (l.inbox_nome as string) ?? null,
    unidade_texto: (l.unidade as string) ?? null,
    unidade_id: porNome.get(String(l.unidade ?? "").trim().toLowerCase()) ?? null,
    departamento: (l.departamento as string) ?? null,
    telefone: (l.telefone as string) ?? null,
    contato_nome: (l.contato_nome as string) ?? null,
    assignee_nome: (l.assignee_nome as string) ?? null,
    conversa_status: (l.conversa_status as string) ?? null,
    ultima_msg_em: (l.ultima_msg_em as string) ?? null,
    ultimo_autor: (l.ultimo_autor as string) ?? null,
    horas_desde_ultima: l.horas_desde_ultima != null ? Number(l.horas_desde_ultima) : null,
    primeiro_contato_em: (l.primeiro_contato_em as string) ?? null,
    primeiro_humano_em: (l.primeiro_humano_em as string) ?? null,
    houve_humano: !!l.houve_humano,
    so_falou_com_bot: !!l.so_falou_com_bot,
    minutos_ate_humano: l.minutos_ate_humano != null ? Number(l.minutos_ate_humano) : null,
    msgs_do_contato: Number(l.msgs_do_contato ?? 0),
    msgs_do_bot: Number(l.msgs_do_bot ?? 0),
    atualizado_em: carimbo,
  })).filter((r) => Number.isFinite(r.conversa_id));

  const { error, count } = await sb.from("atendimento_conversa_estado")
    .upsert(registros, { onConflict: "conversa_id", count: "exact" });
  if (error) return json({ error: error.message }, 500);

  // 🔴 O ESTADO SÓ RECEBIA UPSERT E NUNCA PERDIA LINHA (09/09/2026).
  //
  // Conversa que sai da view — porque a equipe RESOLVEU — ficava aqui com a
  // última foto, e o detector seguia lendo. Foi assim que o Henrique Supriano
  // (conv 20732), encerrado no Chatwoot, continuou virando R18 e caiu na DM da
  // Daiana às 08:00 com "entra agora". Mesmo padrão do ciclo de renovação: o
  // sync fazia upsert do que veio e nunca encerrava o que saiu.
  //
  // ⚠️ AUSÊNCIA NÃO PROVA SAÍDA quando a foto é truncada. O teto do `fonte=calor`
  //    foi ao maximo do PostgREST (1.000), mas a view tem 1.452 linhas e a
  //    guarda continua obrigatória: no dia em que a base crescer além do teto, o
  //    corte volta a existir e apagar "quem não veio" varreria conversa viva.
  //
  // A trava é a MARCA D'ÁGUA: o export ordena por `ultima_msg_em desc`, então a
  // foto cobre INTEGRALMENTE tudo a partir da linha mais antiga que veio. Acima
  // dessa marca, não ter vindo é prova de saída; abaixo dela, não se conclui
  // nada — mesmo raciocínio do `p_truncado` da foto de conversa, aproveitando a
  // ordenação para salvar a parte que dá para afirmar.
  //
  // ⚠️ O predicado é `atualizado_em < carimbo desta rodada`, NÃO uma lista de
  //    ids: com mil linhas o `not.in.(…)` viraria uma URL de varios kB. Toda
  //    linha da foto acabou de ser gravada com este carimbo, então quem ficou
  //    para trás é exatamente quem não veio.
  let encerradas = 0;
  const marca = registros
    .map((r) => r.ultima_msg_em)
    .filter((d): d is string => !!d)
    .sort()[0];
  if (marca) {
    const { data: apagadas, error: errDel } = await sb
      .from("atendimento_conversa_estado")
      .delete()
      .gte("ultima_msg_em", marca)
      .lt("atualizado_em", carimbo)
      .select("conversa_id");
    if (!errDel) encerradas = (apagadas ?? []).length;
  }

  // `telefone_key` é derivada pela função canônica do projeto — normalizar em TS
  // criaria uma 2ª regra de telefone, que é exatamente o que já mordeu aqui
  // (`candidatosTelefone` duplicada nas duas edges de Meta Ads).
  const { error: errKey } = await sb.rpc("exec_normalizar_telefone_atendimento");
  const keyOk = !errKey;

  const { data: det, error: errDet } = await sb.rpc("radar_detectar_calor_atendimento_v1", {});

  return json({
    ok: true,
    conversas_lidas: linhas.length,
    gravadas: count ?? registros.length,
    // saíram da view acima da marca d'água (resolvidas ou respondidas)
    encerradas,
    telefone_key_ok: keyOk,
    detector: errDet ? { erro: errDet.message } : det,
  });
});
