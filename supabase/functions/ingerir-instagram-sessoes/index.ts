/// <reference lib="deno.ns" />
// Porta de entrada do canal Instagram no LA Report — A1 do Mapa de Sinais.
//
// POR QUE EXISTE: o Instagram da LA nunca passou pelo Chatwoot. O canal real é
// a bridge `instagram-comments-bridge.js` na la-hq (systemd, porta 3212, tunnel
// Cloudflare), que fala Meta → Graph API direto. Ela é movimentada — 516
// eventos úteis em agosto/2026 nas duas contas — e guarda TUDO num arquivo:
// `/home/mila/.openclaw/workspace/memory/ig_sessions.json`. 141 kB soltos num
// VPS, sem banco, sem backup, invisíveis para qualquer relatório.
//
// Esta edge é só a PORTA. Ela não interpreta nada: recebe o conteúdo do arquivo
// e faz upsert em `instagram_sessoes`. A bridge continua sendo a fonte viva;
// isto é foto para leitura, relatório e sinal.
//
// ⚠️ NÃO escreve em `leads` nem em `alunos`. A atribuição de origem do lead é
// outra decisão, com política first-touch própria (padrão de
// `varrer-atribuicao-meta-ads`), e misturar as duas aqui faria uma porta de
// ingestão passar a alterar o funil comercial sem ninguém pedir.
//
// Idempotente por construção: PK (ig_user_id, sender_id) + upsert. Rodar duas
// vezes é o mesmo que rodar uma — o que importa neste ambiente, onde um disparo
// de cron vira 2-4 execuções.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TETO_SESSOES = 5000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Comparação em tempo constante: sem isto, a latência do `!==` vaza o prefixo. */
function tokensBatem(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

async function tokenDoCofre(sb: SupabaseClient, nome: string): Promise<string> {
  const { data } = await sb.from("integracao_tokens")
    .select("token").eq("nome", nome).maybeSingle();
  return data?.token ?? "";
}

/** A bridge grava epoch em SEGUNDOS ou MILISSEGUNDOS conforme o campo. */
function instante(v: unknown): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

interface SessaoBridge {
  account?: string;
  ig_user_id?: string;
  sender_id?: string;
  sender_name?: string | null;
  interest?: string | null;
  stage?: string;
  unit?: string | null;
  phone?: string | null;
  transferred?: boolean;
  started_at?: number;
  last_activity?: number;
  history?: Array<{ role: string; content: string }>;
}

serve(async (req) => {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const esperado = await tokenDoCofre(sb, "instagram_bridge");
  const oferecido = req.headers.get("x-radar-token") ?? "";
  if (!esperado) return json({ error: "token_nao_configurado" }, 500);
  if (!tokensBatem(oferecido, esperado)) {
    return new Response("unauthorized", { status: 401 });
  }
  if (req.method !== "POST") return json({ ok: true, nota: "vivo" });

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "json_invalido" }, 400);
  }

  // O arquivo da bridge mistura sessões com locks `human_*`. Só sessão entra.
  const cru = (corpo.sessoes ?? corpo) as Record<string, SessaoBridge>;
  const entradas = Object.entries(cru)
    .filter(([k, v]) =>
      !k.startsWith("human") && v && typeof v === "object" && v.sender_id
    )
    .slice(0, TETO_SESSOES);

  if (entradas.length === 0) {
    // Foto vazia ABORTA sem escrever. Um arquivo truncado ou um erro de leitura
    // no VPS não pode ser lido como "o Instagram não teve movimento" — é a mesma
    // guarda de `atualizar-inadimplencia-emusys`.
    return json({ error: "foto_vazia", nota: "nada gravado de proposito" }, 422);
  }

  // Mapa nome da unidade -> id. A bridge escreve "Campo Grande"/"Barra"/"Recreio".
  const { data: unidades } = await sb.from("unidades").select("id, nome");
  const idPorUnidade = new Map<string, string>(
    (unidades ?? []).map((u: { id: string; nome: string }) => [
      u.nome.trim().toLowerCase(),
      u.id,
    ]),
  );

  const linhas = entradas.map(([, s]) => ({
    ig_user_id: String(s.ig_user_id ?? ""),
    sender_id: String(s.sender_id ?? ""),
    conta: String(s.account ?? "(desconhecida)"),
    sender_name: s.sender_name ?? null,
    interesse: s.interest ?? null,
    estagio: String(s.stage ?? "?"),
    unidade_nome: s.unit ?? null,
    unidade_id: s.unit
      ? idPorUnidade.get(s.unit.trim().toLowerCase()) ?? null
      : null,
    telefone: s.phone ?? null,
    transferido: Boolean(s.transferred),
    iniciada_em: instante(s.started_at) ?? new Date().toISOString(),
    ultima_atividade_em: instante(s.last_activity) ??
      instante(s.started_at) ?? new Date().toISOString(),
    historico: Array.isArray(s.history) ? s.history : [],
    capturado_em: new Date().toISOString(),
  })).filter((l) => l.ig_user_id && l.sender_id);

  const { error, count } = await sb.from("instagram_sessoes")
    .upsert(linhas, { onConflict: "ig_user_id,sender_id", count: "exact" });

  if (error) return json({ error: error.message }, 500);

  const paradas = linhas.filter((l) => !l.transferido).length;
  return json({
    ok: true,
    recebidas: entradas.length,
    gravadas: count ?? linhas.length,
    transferidas: linhas.length - paradas,
    paradas_no_meio: paradas,
    contas: [...new Set(linhas.map((l) => l.conta))],
  });
});
