/// <reference lib="deno.ns" />

// Ponte Sol → Super Folha para o lote de cheques (26/09/2026).
//
// A Sol lê o PDF do lote de cheques no grupo do financeiro e precisa chamar
// `cheques-sol` do Super Folha (conferir / registrar), que autentica pelo
// segredo compartilhado `x-super-folha-sync-secret`. Esse segredo JÁ mora aqui
// (SUPER_FOLHA_FINANCEIRO_SECRET, o mesmo do export-financeiro-lancamentos) e NÃO
// existe na VPS da Sol — copiá-lo para lá espalharia o segredo por mais uma
// máquina. Esta edge é só transporte: confere que quem chama é service_role (a
// Sol usa a service key), valida o formato e repassa.
//
// ⚠️ Quem responde "este bearer é service_role?" é o PostgREST
//    (`papel_da_sessao_v1`), nunca comparação de string de chave: a VPS usa
//    `sb_secret_…` e o runtime o JWT legado (medido em 13/09).
// ⚠️ Recusa documento em claro ANTES de sair daqui: CPF/CNPJ só como hash.
// ⚠️ Nunca loga o corpo (nome de emitente, conta, valores).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const SEGREDO = Deno.env.get('SUPER_FOLHA_FINANCEIRO_SECRET')?.trim()
  || Deno.env.get('SUPER_FOLHA_CONTAS_RECEBER_SECRET')?.trim()
  || '';
const DESTINO = Deno.env.get('SUPER_FOLHA_CHEQUES_URL')?.trim()
  || 'https://ubdvtjbitozhkuvvqkxj.supabase.co/functions/v1/cheques-sol';
const ACOES = new Set(['conferir', 'registrar']);
const UNIDADES = new Set(['cg', 'rec', 'bar']);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

async function bearerEhServiceRole(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  try {
    const url = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !anonKey) return false;
    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.rpc('papel_da_sessao_v1');
    if (error) return false;
    return String(data || '') === 'service_role';
  } catch {
    return false;
  }
}

// Documento em claro em qualquer campo: chave com "cpf"/"cnpj"/"documento" que
// não seja o hash, ou valor com cara de CPF/CNPJ formatado.
export function temDocumentoEmClaro(valor: unknown, chave = ''): boolean {
  const k = chave.toLowerCase();
  if (valor && typeof valor === 'object') {
    return Object.entries(valor as Record<string, unknown>).some(([ck, cv]) => temDocumentoEmClaro(cv, ck));
  }
  if (/(cpf|cnpj|documento)/.test(k) && !/hash/.test(k) && valor != null && String(valor).trim() !== '') return true;
  if (typeof valor === 'string' && /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/.test(valor)) return true;
  return false;
}

export function validarPedido(body: any): string | null {
  if (!body || typeof body !== 'object') return 'corpo invalido';
  if (!ACOES.has(String(body.acao))) return 'acao deve ser conferir ou registrar';
  if (!Array.isArray(body.cheques) || body.cheques.length === 0 || body.cheques.length > 30) return 'cheques: 1 a 30 itens';
  for (const [i, c] of body.cheques.entries()) {
    if (!c || typeof c !== 'object') return `cheque ${i + 1}: invalido`;
    if (!UNIDADES.has(String(c.unidade))) return `cheque ${i + 1}: unidade invalida`;
    if (!/^\d{1,10}$/.test(String(c.numero ?? ''))) return `cheque ${i + 1}: numero invalido`;
    if (!(Number(c.valor) > 0)) return `cheque ${i + 1}: valor invalido`;
    if (c.emitente_documento_hash != null && !/^[0-9a-f]{64}$/.test(String(c.emitente_documento_hash))) {
      return `cheque ${i + 1}: emitente_documento_hash invalido`;
    }
  }
  if (body.acao === 'registrar' && (!body.ator || typeof body.ator !== 'object')) return 'registrar exige ator';
  if (temDocumentoEmClaro(body)) return 'documento em claro recusado';
  return null;
}

serve(async (request) => {
  if (request.method !== 'POST') return json({ success: false, error: 'metodo nao permitido' }, 405);
  if (!(await bearerEhServiceRole(request.headers.get('Authorization')))) {
    return json({ success: false, error: 'nao_autorizado' }, 401);
  }
  if (!SEGREDO) return json({ success: false, error: 'segredo do Super Folha nao configurado' }, 503);
  let body: any;
  try { body = await request.json(); } catch { return json({ success: false, error: 'json invalido' }, 400); }
  const erro = validarPedido(body);
  if (erro) return json({ success: false, error: erro }, 400);

  const pedido: Record<string, unknown> = { acao: body.acao, cheques: body.cheques };
  if (body.acao === 'registrar') pedido.ator = body.ator;
  try {
    const resp = await fetch(DESTINO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-super-folha-sync-secret': SEGREDO },
      body: JSON.stringify(pedido),
      signal: AbortSignal.timeout(45_000),
    });
    const texto = await resp.text();
    console.log(JSON.stringify({ evento: 'sol_cheques_super_folha', acao: body.acao, cheques: body.cheques.length, status: resp.status }));
    return new Response(texto, { status: resp.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.log(JSON.stringify({ evento: 'sol_cheques_super_folha', acao: body.acao, erro: String((e as Error)?.name || 'falha') }));
    return json({ success: false, error: 'super_folha_indisponivel' }, 502);
  }
});
