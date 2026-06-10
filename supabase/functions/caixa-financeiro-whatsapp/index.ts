/// <reference lib="deno.ns" />

// Edge Function: caixa-financeiro-whatsapp
// Envia manualmente o fechamento de caixa diario para o grupo financeiro da unidade.
// Fase 1: dry-run e envio manual. Sem agendamento automatico.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WHATSAPP_FIELDS = 'id,nome,provedor,uazapi_url,uazapi_token,waha_url,waha_session,waha_api_key';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppCreds {
  caixaId: number;
  caixaNome: string;
  provedor: 'uazapi' | 'waha';
  baseUrl: string;
  token: string;
  wahaUrl?: string;
  wahaSession?: string;
  wahaApiKey?: string;
}

interface Payload {
  caixa_diario_id?: string;
  modo?: 'dry_run' | 'send';
  numero_teste?: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function n(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moeda(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function dataPtBr(value: string): string {
  const [year, month, day] = String(value).split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function resumoCaixa(caixa: any, movimentos: any[]) {
  const saldoInicialCofre = n(caixa?.saldo_inicial_cofre);
  const soma = (predicate: (mov: any) => boolean) =>
    movimentos.filter(predicate).reduce((total, mov) => total + n(mov.valor), 0);

  const entradasDinheiroCofre = soma((mov) =>
    mov.ambiente === 'cofre' && mov.tipo === 'entrada' && mov.forma_pagamento === 'dinheiro'
  );
  const saidasDinheiroCofre = soma((mov) =>
    mov.ambiente === 'cofre' && mov.tipo === 'saida' && mov.forma_pagamento === 'dinheiro'
  );
  const vendasPorForma = (forma: string) =>
    soma((mov) => mov.ambiente === 'venda' && mov.tipo === 'entrada' && mov.forma_pagamento === forma);

  return {
    saldoInicialCofre,
    entradasDinheiroCofre,
    saidasDinheiroCofre,
    saldoFinalCalculado: saldoInicialCofre + entradasDinheiroCofre - saidasDinheiroCofre,
    vendasDinheiro: vendasPorForma('dinheiro'),
    vendasPix: vendasPorForma('pix'),
    vendasCartao: vendasPorForma('cartao'),
    vendasCheque: vendasPorForma('cheque'),
    vendasTransferencia: vendasPorForma('transferencia'),
    vendasOutro: vendasPorForma('outro'),
  };
}

function linhasCofre(movimentos: any[], tipo: 'entrada' | 'saida'): string {
  const linhas = movimentos
    .filter((mov) => mov.ambiente === 'cofre' && mov.tipo === tipo && mov.forma_pagamento === 'dinheiro')
    .map((mov) => `- ${moeda(n(mov.valor))} - ${mov.descricao}`);

  return linhas.length ? linhas.join('\n') : '- R$ 0,00 -';
}

function linhasDetalheCartao(movimentos: any[]): string[] {
  const cartoes = movimentos.filter(
    (m) => m.forma_pagamento === 'cartao' && (m.cartao_modalidade || m.link_pagamento)
  );
  if (!cartoes.length) return [];

  const linhas = cartoes.map((m) => {
    const partes: string[] = [moeda(n(m.valor))];
    if (m.cartao_modalidade === 'debito') partes.push('Debito');
    if (m.cartao_modalidade === 'credito') {
      partes.push(`Credito${m.cartao_parcelas ? ` ${m.cartao_parcelas}x` : ''}`);
    }
    if (m.descricao) partes.push(m.descricao);
    let linha = `- ${partes.join(' - ')}`;
    if (m.link_pagamento) linha += `\n  🔗 ${m.link_pagamento}`;
    return linha;
  });

  return ['', '💳 *Cartao (detalhe):*', ...linhas];
}

function formatarRelatorioCaixaWhatsApp(params: {
  caixa: any;
  movimentos: any[];
  unidadeNome: string;
  unidadeCodigo: string;
  conferidoPor: string;
}): string {
  const { caixa, movimentos, unidadeNome, unidadeCodigo, conferidoPor } = params;
  const resumo = resumoCaixa(caixa, movimentos);
  const data = dataPtBr(caixa.data_caixa);

  return [
    `*FECHAMENTO DE CAIXA DE ${String(unidadeNome).toUpperCase()}*`,
    `📆 ${data}`,
    '',
    `💰 *Caixa Cofre Dinheiro - ${unidadeCodigo}*`,
    '',
    `Saldo inicial: *${moeda(resumo.saldoInicialCofre)}*`,
    '',
    '🟢 *Entrada do dia:*',
    linhasCofre(movimentos, 'entrada'),
    '',
    '🔴 *Saida do dia:*',
    linhasCofre(movimentos, 'saida'),
    '',
    '🧾 *Vendas / Caixa Diario:*',
    `- Dinheiro: ${moeda(resumo.vendasDinheiro)}`,
    `- Pix: ${moeda(resumo.vendasPix)}`,
    `- Cartao: ${moeda(resumo.vendasCartao)}`,
    `- Cheque: ${moeda(resumo.vendasCheque)}`,
    `- Transferencia: ${moeda(resumo.vendasTransferencia)}`,
    ...linhasDetalheCartao(movimentos),
    '',
    `✅ *Saldo final caixa dia ${data}:* ${moeda(resumo.saldoFinalCalculado)}`,
    '',
    `Conferido por: *${conferidoPor || '-'}*`,
    '_Gerado pelo LA Report_',
  ].join('\n');
}

function toCreds(row: any): WhatsAppCreds {
  let baseUrl = row.uazapi_url || '';
  if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }

  return {
    caixaId: row.id,
    caixaNome: row.nome,
    provedor: row.provedor || 'uazapi',
    baseUrl: baseUrl.replace(/\/+$/, ''),
    token: row.uazapi_token || '',
    wahaUrl: row.waha_url ? row.waha_url.replace(/\/+$/, '') : undefined,
    wahaSession: row.waha_session || undefined,
    wahaApiKey: row.waha_api_key || undefined,
  };
}

async function getWhatsAppCredentials(
  supabase: any,
  opts: { funcao?: string; unidadeId?: string } = {}
): Promise<WhatsAppCreds> {
  const { funcao = 'sistema', unidadeId } = opts;

  if (funcao && unidadeId) {
    const { data } = await supabase
      .from('whatsapp_caixas')
      .select(WHATSAPP_FIELDS)
      .eq('ativo', true)
      .eq('unidade_id', unidadeId)
      .in('funcao', [funcao, 'ambos'])
      .limit(1)
      .maybeSingle();
    if (data) return toCreds(data);
  }

  if (funcao) {
    const { data } = await supabase
      .from('whatsapp_caixas')
      .select(WHATSAPP_FIELDS)
      .eq('ativo', true)
      .in('funcao', [funcao, 'ambos'])
      .limit(1)
      .maybeSingle();
    if (data) return toCreds(data);
  }

  const { data } = await supabase
    .from('whatsapp_caixas')
    .select(WHATSAPP_FIELDS)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle();

  if (data) return toCreds(data);
  throw new Error('Nenhuma caixa WhatsApp ativa encontrada para envio do caixa financeiro.');
}

async function enviarWhatsApp(destino: string, mensagem: string, creds: WhatsAppCreds) {
  let response: Response;

  if (creds.provedor === 'waha') {
    if (!creds.wahaUrl || !creds.wahaSession) {
      return { success: false, error: 'Credenciais WAHA incompletas.' };
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (creds.wahaApiKey) headers['X-Api-Key'] = creds.wahaApiKey;

    response = await fetch(`${creds.wahaUrl}/api/sendText`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ session: creds.wahaSession, chatId: destino, text: mensagem }),
    });
  } else {
    if (!creds.baseUrl || !creds.token) {
      return { success: false, error: 'Credenciais UAZAPI incompletas.' };
    }

    response = await fetch(`${creds.baseUrl}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: creds.token },
      body: JSON.stringify({ number: destino, text: mensagem, delay: 0, readchat: true }),
    });
  }

  const data = await response.json().catch(() => ({}));
  if (response.ok && !data.error) {
    return { success: true, messageId: data.id || data.messageid || data.key?.id };
  }

  const error =
    (typeof data.error === 'string' ? data.error : null) ||
    data.message ||
    data.detail ||
    `HTTP ${response.status}`;
  return { success: false, error };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: Payload = await req.json().catch(() => ({}));
    const modo = payload.modo || 'dry_run';

    if (!payload.caixa_diario_id) {
      return jsonResponse({ ok: false, success: false, error: 'caixa_diario_id obrigatorio.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, success: false, error: 'Ambiente Supabase nao configurado.' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: caixa, error: caixaError } = await supabase
      .from('caixas_diarios')
      .select('*, unidades(id,nome,codigo)')
      .eq('id', payload.caixa_diario_id)
      .maybeSingle();

    if (caixaError) throw caixaError;
    if (!caixa) {
      return jsonResponse({ ok: false, success: false, error: 'Caixa diario nao encontrado.' }, 404);
    }

    const { data: movimentos, error: movimentosError } = await supabase
      .from('caixa_movimentacoes')
      .select('*')
      .eq('caixa_diario_id', caixa.id)
      .order('created_at', { ascending: true });

    if (movimentosError) throw movimentosError;

    const unidade = caixa.unidades || {};
    const unidadeNome = unidade.nome || 'Unidade';
    const unidadeCodigo = unidade.codigo || unidadeNome;
    const conferidoPor = caixa.fechado_por || caixa.aberto_por || '-';
    const texto = formatarRelatorioCaixaWhatsApp({
      caixa,
      movimentos: movimentos || [],
      unidadeNome,
      unidadeCodigo,
      conferidoPor,
    });

    const { data: grupo, error: grupoError } = await supabase
      .from('caixa_financeiro_grupos_whatsapp')
      .select('id,nome_grupo,grupo_jid,ativo')
      .eq('unidade_id', caixa.unidade_id)
      .eq('ativo', true)
      .maybeSingle();

    if (grupoError) throw grupoError;

    const destino = payload.numero_teste
      ? payload.numero_teste.replace(/\D/g, '')
      : grupo?.grupo_jid || null;

    if (modo === 'dry_run') {
      return jsonResponse({
        ok: true,
        success: true,
        dry_run: true,
        texto,
        destino,
        grupo: grupo?.nome_grupo || null,
        aviso: grupo ? null : 'Grupo financeiro ainda nao configurado para esta unidade.',
      });
    }

    if (!destino) {
      return jsonResponse({
        ok: false,
        success: false,
        error: 'Grupo financeiro nao configurado para esta unidade.',
        texto,
      });
    }

    const creds = await getWhatsAppCredentials(supabase, {
      funcao: 'sistema',
      unidadeId: caixa.unidade_id,
    });
    const resultado = await enviarWhatsApp(destino, texto, creds);

    await supabase
      .from('caixas_diarios')
      .update({
        ultimo_envio_whatsapp_em: new Date().toISOString(),
        ultimo_envio_whatsapp_por: caixa.fechado_por || caixa.aberto_por || null,
        ultimo_envio_whatsapp_status: resultado.success ? 'enviado' : 'erro',
        ultimo_envio_whatsapp_erro: resultado.success ? null : resultado.error,
      })
      .eq('id', caixa.id);

    return jsonResponse({
      ok: resultado.success,
      success: resultado.success,
      error: resultado.error,
      messageId: resultado.messageId,
      destino,
      grupo: grupo?.nome_grupo || (payload.numero_teste ? 'TESTE' : null),
      texto,
    });
  } catch (error) {
    console.error('[caixa-financeiro-whatsapp] Erro:', error);
    return jsonResponse(
      {
        ok: false,
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno do servidor.',
      },
      200
    );
  }
});
