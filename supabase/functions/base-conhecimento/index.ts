// ============================================================================
// base-conhecimento — entrega a base de conhecimento da LA Music em text/plain
//
// Consumidor: o nó `bd_conhecimento` dos agentes SDR Mila no n8n
// (`httpRequestTool`), que faz GET simples e joga a resposta crua no LLM.
// Antes apontava para um artigo do Help Center do Chatwoot que devolve 404
// desde que o portal `la-music` foi deletado.
//
// ⚠️ Esta função é SÓ TRANSPORTE. A montagem do texto mora na RPC
//    `get_base_conhecimento` — a mesma que o botão "Ver como a Mila vê" chama.
//    Não reimplementar a concatenação aqui: duas implementações da mesma regra
//    fazem o preview divergir do que a Mila recebe.
//
// ⚠️ verify_jwt = false. Deploy pelo MCP RESETA esse flag para true e não lê o
//    config.toml — passar explícito e conferir com curl depois.
//
// Spec: docs/superpowers/specs/2026-08-20-base-conhecimento-la-report-design.md
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function texto(corpo: string, status = 200): Response {
  return new Response(corpo, {
    status,
    headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/** Comparação em tempo constante — não vaza o token por timing. */
function tokenConfere(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const url = new URL(req.url);
    const tokenRecebido = (url.searchParams.get('token') ?? '').trim();
    const unidadeParam = (url.searchParams.get('unidade') ?? '').trim();

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── Token ────────────────────────────────────────────────────────────
    // Guardado em `integracao_tokens` (RLS sem policy: só service_role lê),
    // e não em secret, para poder rotacionar sem redeploy.
    const { data: tokenRow, error: erroToken } = await supabase
      .from('integracao_tokens')
      .select('token')
      .eq('nome', 'base_conhecimento')
      .maybeSingle();

    if (erroToken || !tokenRow?.token) {
      console.error('token de acesso não configurado', erroToken);
      return texto('Base de conhecimento indisponível no momento.', 503);
    }
    if (!tokenRecebido || !tokenConfere(tokenRecebido, tokenRow.token)) {
      return texto('Acesso negado.', 401);
    }

    // ── Unidade ──────────────────────────────────────────────────────────
    // Aceita uuid ou nome ("campo grande", "Recreio", "barra"). Sem unidade,
    // devolve só os blocos globais — degrada, não quebra.
    let unidadeId: string | null = null;

    if (unidadeParam) {
      const ehUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        .test(unidadeParam);

      if (ehUuid) {
        unidadeId = unidadeParam;
      } else {
        const { data: unidade } = await supabase
          .from('unidades')
          .select('id, nome')
          .ilike('nome', `%${unidadeParam}%`)
          .limit(1)
          .maybeSingle();

        if (!unidade) {
          return texto(`Unidade não encontrada: ${unidadeParam}`, 400);
        }
        unidadeId = unidade.id;
      }
    }

    // ── Montagem: RPC, fonte única ───────────────────────────────────────
    const { data, error } = await supabase.rpc('get_base_conhecimento', {
      p_unidade_id: unidadeId,
    });

    if (error) {
      console.error('erro ao montar base de conhecimento', error);
      return texto('Base de conhecimento indisponível no momento.', 500);
    }

    return texto(data ?? '# Base de Conhecimento LA Music');
  } catch (err) {
    console.error('erro inesperado', err);
    return texto('Base de conhecimento indisponível no momento.', 500);
  }
});
