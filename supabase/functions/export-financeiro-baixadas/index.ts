/// <reference lib="deno.ns" />

// "Faturas baixadas desde <ts>" para o Super Folha (pedido Alf 08/10/2026):
// leitura direta do espelho emusys_faturas, que e atualizado a cada 15 min
// na competencia vigente (60 min em M-1/M-2, backlog 2h no resto). Substitui
// a espera do faturas_pagas_mes (diario) para "a parcela ja caiu no Emusys?".
//
//   POST {
//     desde_data_pagamento?: 'YYYY-MM-DD',   // data_pagamento >= X
//     sincronizado_desde?:   '<timestamptz>', // espelho aprendeu desde ts
//     unidade_id?: uuid,
//     limite?: int (default 500, max 2000)
//   }
// Ao menos um dos dois filtros e obrigatorio; os dois combinam com OR —
// sincronizado_desde e o poll barato recomendado a cada 15 min.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRETS = [
  Deno.env.get('SUPER_FOLHA_CONTAS_RECEBER_SECRET'),
  Deno.env.get('SUPER_FOLHA_FINANCEIRO_SECRET'),
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

  if (desdeDataPagamento !== null && !DATE_RE.test(String(desdeDataPagamento))) {
    return json({ ok: false, error: 'desde_data_pagamento_invalido' }, 400);
  }
  if (desdeDataPagamento === null && sincronizadoDesde === null) {
    return json({
      ok: false,
      error: 'filtro_obrigatorio',
      detalhe: 'informe desde_data_pagamento (YYYY-MM-DD) ou sincronizado_desde (timestamptz)',
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
    p_unidade_id: unidadeId,
    p_limite: limite,
  });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, ...(data as Record<string, unknown>) });
});
