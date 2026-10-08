/// <reference lib="deno.ns" />

// "Faturas baixadas/desfeitas desde <ts>" para o Super Folha (contrato
// aprovado 08/10/2026): leitura do espelho emusys_faturas + auditoria de
// baixas desfeitas, numa corrente ordenada por (sincronizado_em,
// emusys_fatura_id) com filtro INCLUSIVO — o SF deduplica por
// emusys_fatura_id e continua de `proximo_cursor`.
//
//   POST {
//     cursor?:               'timestamptz|emusys_fatura_id',  // continuar
//     sincronizado_desde?:   '<timestamptz>',                 // 1o poll
//     desde_data_pagamento?: 'YYYY-MM-DD',                    // varredura
//     unidade_id?: uuid,
//     limite?: int (default 500, max 2000)
//   }
// Ao menos um dos tres e obrigatorio. itens[].situacao = 'baixada' |
// 'desfeita' (estorno/remocao — desfeita traz os dados da baixa anterior).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRETS = [
  Deno.env.get('SUPER_FOLHA_FINANCEIRO_SECRET'),
  Deno.env.get('SUPER_FOLHA_CONTAS_RECEBER_SECRET'),
].filter((s): s is string => !!s?.trim()).map((s) => s.trim());

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

function safeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURSOR_RE = /^.+\|\d+$/;

serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const header = req.headers.get('x-super-folha-sync-secret')?.trim() ?? '';
  if (!header || !SECRETS.some((secret) => safeEqual(header, secret))) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const desdeDataPagamento = body.desde_data_pagamento ?? body.data_pagamento_inicial ?? null;
  const sincronizadoDesde = body.sincronizado_desde ?? body.baixadas_desde ?? null;
  const cursor = body.cursor ?? null;

  if (desdeDataPagamento !== null && !DATE_RE.test(String(desdeDataPagamento))) {
    return json({ ok: false, error: 'desde_data_pagamento_invalido' }, 400);
  }
  if (cursor !== null && !CURSOR_RE.test(String(cursor))) {
    return json({ ok: false, error: 'cursor_invalido' }, 400);
  }
  if (desdeDataPagamento === null && sincronizadoDesde === null && cursor === null) {
    return json({
      ok: false,
      error: 'filtro_obrigatorio',
      detalhe: 'informe cursor, sincronizado_desde (timestamptz) ou desde_data_pagamento (YYYY-MM-DD)',
    }, 400);
  }

  const unidadeId = body.unidade_id ?? null;
  const limite = typeof body.limite === 'number' ? body.limite : 500;

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.rpc('exportar_financeiro_baixadas_v1', {
    p_desde_data_pagamento: desdeDataPagamento,
    p_sincronizado_desde: sincronizadoDesde,
    p_cursor: cursor,
    p_unidade_id: unidadeId,
    p_limite: limite,
  });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, ...(data as Record<string, unknown>) });
});
