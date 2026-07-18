/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const INTERNAL_SECRET = Deno.env.get('SUPER_FOLHA_CONTAS_RECEBER_SECRET')?.trim() ?? '';

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

function validateCompetencia(value: unknown) {
  const competencia = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-01$/.test(competencia)) {
    throw new Error('competencia obrigatoria no formato YYYY-MM-01');
  }
  const parsed = new Date(`${competencia}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== competencia) {
    throw new Error('competencia invalida');
  }
  return competencia;
}

function currentCompetenciaBrt() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return { year, month };
}

function namedCompetencia(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized !== 'atual' && normalized !== 'anterior') return validateCompetencia(value);
  const current = currentCompetenciaBrt();
  const date = new Date(Date.UTC(current.year, current.month - 1, 1));
  if (normalized === 'anterior') date.setUTCMonth(date.getUTCMonth() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

serve(async (request) => {
  if (request.method !== 'POST') return json({ success: false, erro: 'metodo nao permitido' }, 405);
  if (!INTERNAL_SECRET) return json({ success: false, erro: 'segredo interno nao configurado' }, 503);
  const supplied = request.headers.get('x-super-folha-sync-secret')?.trim() ?? '';
  if (!supplied || !safeEqual(supplied, INTERNAL_SECRET)) {
    return json({ success: false, erro: 'acesso negado' }, 403);
  }

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const requested = Array.isArray(body.competencias)
      ? body.competencias
      : [body.competencia];
    if (requested.length < 1 || requested.length > 2 || requested.some((item) => item == null)) {
      return json({ success: false, erro: 'informe uma competencia ou atual+anterior' }, 400);
    }
    const competencias = [...new Set(requested.map(namedCompetencia))];
    const resultados = [];

    for (const competencia of competencias) {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-faturas-emusys`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          competencia,
          trigger_source: competencias.length > 1 ? 'cron' : 'internal_refresh',
        }),
      });
      const payload = await response.json().catch(() => ({ erro: `HTTP ${response.status}` }));
      const snapshotComplete = payload.resultado?.snapshot_complete === true;
      resultados.push({ competencia, ...payload, snapshot_complete: snapshotComplete });
      if (!response.ok || !payload.ok || !payload.sync_run_id || !snapshotComplete) {
        return json({
          success: false,
          erro: `refresh falhou na competencia ${competencia}`,
          sync_run_id: payload.sync_run_id ?? null,
          resultados,
        }, response.status === 409 ? 409 : 502);
      }
    }

    return json({
      success: true,
      sync_run_id: resultados.length === 1 ? resultados[0].sync_run_id : null,
      snapshot_complete: resultados.length === 1 ? resultados[0].snapshot_complete : null,
      sync_run_ids: resultados.map((item) => item.sync_run_id),
      resultados,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[refresh-contas-receber]', error);
    return json({ success: false, erro: message }, /competencia/i.test(message) ? 400 : 500);
  }
});
