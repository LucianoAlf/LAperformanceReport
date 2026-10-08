/// <reference lib="deno.ns" />

// Resolvedor compartilhado CNPJ -> responsavel/aluno, aprendido dos Pix de
// CNPJ casados manualmente pelo Super Folha (pedido Alf 08/10/2026).
//
//   POST { modo: 'resolver',  cnpj }                            -> sugestoes rankeadas
//   POST { modo: 'ingestar',  vinculos: [ { cnpj, unidade|unidade_id|unidade_codigo,
//          emusys_fatura_id, casado_em?, acao?='vincular', motivo? } ] }
//   acao='ignorar' -> marca o CNPJ na lista de fora (LA, PagSeguro etc.).
//
// CNPJ em claro nunca e persistido — so HMAC + mascara de depuracao.
// Nada aqui escreve no Emusys; a fatura e resolvida no espelho local.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRETS = [
  Deno.env.get('SUPER_FOLHA_CONTAS_RECEBER_SECRET'),
  Deno.env.get('SUPER_FOLHA_FINANCEIRO_SECRET'),
  Deno.env.get('SUPER_FOLHA_CNPJ_VINCULOS_SECRET'),
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

function autorizado(req: Request) {
  const header = req.headers.get('x-super-folha-sync-secret')?.trim() ?? '';
  if (!header) return false;
  return SECRETS.some((secret) => safeEqual(header, secret));
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  if (!autorizado(req)) return json({ ok: false, error: 'unauthorized' }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const modo = String(body.modo ?? 'resolver');

  if (modo === 'resolver') {
    const cnpj = String(body.cnpj ?? '').trim();
    if (!cnpj) return json({ ok: false, error: 'cnpj_obrigatorio' }, 400);
    const { data, error } = await client.rpc('resolver_financeiro_cnpj_v1', { p_cnpj: cnpj });
    if (error) return json({ ok: false, error: error.message }, 500);
    return json(data);
  }

  if (modo === 'ingestar') {
    const vinculos = body.vinculos;
    if (!Array.isArray(vinculos) || vinculos.length === 0) {
      return json({ ok: false, error: 'vinculos_vazio' }, 400);
    }
    if (vinculos.length > 500) {
      return json({ ok: false, error: 'lote_maximo_500' }, 400);
    }
    const { data, error } = await client.rpc('publicar_financeiro_cnpj_vinculos_v1', {
      p_items: vinculos,
      p_fonte: typeof body.fonte === 'string' ? body.fonte : 'super_folha',
    });
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, ...(data as Record<string, unknown>) });
  }

  return json({ ok: false, error: 'modo_invalido', modos: ['resolver', 'ingestar'] }, 400);
});
