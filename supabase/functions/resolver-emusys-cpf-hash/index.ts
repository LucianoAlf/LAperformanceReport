/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const INTERNAL_SECRET = Deno.env.get('SUPER_FOLHA_FINANCEIRO_SECRET')?.trim()
  || Deno.env.get('SUPER_FOLHA_CONTAS_RECEBER_SECRET')?.trim()
  || '';
const HASH_PATTERN = /^[0-9a-f]{64}$/;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-super-folha-sync-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ success: false, erro: 'metodo nao permitido' }, 405);
  if (!INTERNAL_SECRET) return json({ success: false, erro: 'segredo interno nao configurado' }, 503);

  const supplied = request.headers.get('x-super-folha-sync-secret')?.trim() ?? '';
  if (!supplied || !safeEqual(supplied, INTERNAL_SECRET)) {
    return json({ success: false, erro: 'acesso negado' }, 403);
  }

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const digest = String(body.cpf_hash ?? '').trim().toLowerCase();
    if (!HASH_PATTERN.test(digest)) {
      return json({ success: false, erro: 'cpf_hash deve ter 64 caracteres hexadecimais' }, 400);
    }

    const client = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await client.rpc('resolver_emusys_cpf_hmac', { p_cpf_hmac: digest });
    if (error) throw error;

    const vinculos = Array.isArray(data) ? data : [];
    return json({ success: true, total: vinculos.length, vinculos });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('resolver-emusys-cpf-hash:', message);
    return json({ success: false, erro: 'falha ao consultar vinculos' }, 500);
  }
});

\n