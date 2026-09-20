/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const INTERNAL_SECRET = Deno.env.get('SUPER_FOLHA_FINANCEIRO_SECRET')?.trim()
  || Deno.env.get('SUPER_FOLHA_CONTAS_RECEBER_SECRET')?.trim()
  || '';
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MAX_HASHES_POR_LOTE = 1000;

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

function normalizarHash(valor: unknown) {
  return String(valor ?? '').trim().toLowerCase();
}

function validarHash(hash: string) {
  return HASH_PATTERN.test(hash);
}

function vinculoPublico(linha: unknown): Record<string, unknown> | null {
  if (!linha || typeof linha !== 'object') return null;
  const origem = linha as Record<string, unknown>;
  return {
    papel_cpf: origem.papel_cpf ?? null,
    unidade_id: origem.unidade_id ?? null,
    unidade_nome: origem.unidade_nome ?? null,
    aluno_id: origem.aluno_id ?? null,
    aluno_nome: origem.aluno_nome ?? null,
    responsavel_nome: origem.responsavel_nome ?? null,
    emusys_aluno_id: origem.emusys_aluno_id ?? null,
    emusys_responsavel_id: origem.emusys_responsavel_id ?? null,
    emusys_matricula_id: origem.emusys_matricula_id ?? null,
  };
}

function vinculosPublicos(data: unknown) {
  if (!Array.isArray(data)) return [];
  return data.flatMap((linha) => {
    const vinculo = vinculoPublico(linha);
    return vinculo ? [vinculo] : [];
  });
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
    const recebeuHashUnitario = body.cpf_hash !== undefined;
    const recebeuHashes = body.cpf_hashes !== undefined;
    if (recebeuHashUnitario && recebeuHashes) {
      return json({ success: false, erro: 'informe cpf_hash ou cpf_hashes, nunca os dois' }, 400);
    }

    const client = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    if (recebeuHashes) {
      if (!Array.isArray(body.cpf_hashes)) {
        return json({ success: false, erro: 'cpf_hashes deve ser uma lista de hashes hexadecimais' }, 400);
      }
      if (body.cpf_hashes.length === 0 || body.cpf_hashes.length > MAX_HASHES_POR_LOTE) {
        return json({
          success: false,
          erro: `cpf_hashes deve ter entre 1 e ${MAX_HASHES_POR_LOTE} itens`,
        }, 400);
      }

      const hashes = body.cpf_hashes.map(normalizarHash);
      if (hashes.some((hash) => !validarHash(hash))) {
        return json({ success: false, erro: 'cpf_hashes contem hash invalido' }, 400);
      }

      const hashesUnicos = [...new Set(hashes)];
      const { data, error } = await client.rpc('resolver_emusys_cpf_hmac_lote', {
        p_cpfs_hmac: hashesUnicos,
      });
      if (error) throw error;

      const porHash = new Map<string, Record<string, unknown>[]>();
      for (const linha of Array.isArray(data) ? data : []) {
        if (!linha || typeof linha !== 'object') continue;
        const origem = linha as Record<string, unknown>;
        const hashInterno = origem.cpf_hmac;
        const hash = normalizarHash(hashInterno);
        if (!validarHash(hash)) continue;
        const vinculo = vinculoPublico(origem);
        if (!vinculo) continue;
        porHash.set(hash, [...(porHash.get(hash) ?? []), vinculo]);
      }

      // A posicao do resultado corresponde a do hash recebido. O HMAC nao e
      // ecoado: o consumidor ja conhece a chave de cada posicao da sua lista.
      const resultados = hashes.map((hash) => {
        const vinculos = porHash.get(hash) ?? [];
        return { total: vinculos.length, vinculos };
      });
      return json({
        success: true,
        total_hashes: hashes.length,
        total_vinculos: resultados.reduce((soma, resultado) => soma + resultado.total, 0),
        resultados,
      });
    }

    const digest = normalizarHash(body.cpf_hash);
    if (!validarHash(digest)) {
      return json({ success: false, erro: 'cpf_hash deve ter 64 caracteres hexadecimais' }, 400);
    }
    const { data, error } = await client.rpc('resolver_emusys_cpf_hmac', { p_cpf_hmac: digest });
    if (error) throw error;

    const vinculos = vinculosPublicos(data);
    return json({ success: true, total: vinculos.length, vinculos });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('resolver-emusys-cpf-hash:', message);
    return json({ success: false, erro: 'falha ao consultar vinculos' }, 500);
  }
});
