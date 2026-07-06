// Edge Function: notificar-primeira-aula-fabi
// Resumo das primeiras aulas de ONTEM (calouros com presença detectada, pendentes de
// pesquisa) enviado por WhatsApp (caixa "Sucesso do Aluno", id=3) para a Fabi.
// Reaproveita a MESMA RPC da aba Pós-1ª Aula: get_candidatos_pesquisa_primeira_aula.
// Disparo via pg_cron (diário, manhã). Filtra data_primeira_aula = ontem (BRT).
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const CAIXA_SUCESSO_ID = 3;
const NUMERO_FABI = '5521994696489';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Data de "ontem" no fuso BRT (UTC-3), formato 'YYYY-MM-DD'.
function ontemBRT() {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  brt.setUTCDate(brt.getUTCDate() - 1);
  const y = brt.getUTCFullYear();
  const m = String(brt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(brt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmtData(d) {
  // 'YYYY-MM-DD' -> 'DD/MM'
  if (!d) return '';
  const [ano, mes, dia] = String(d).split('-');
  return dia && mes ? `${dia}/${mes}` : String(d);
}

async function enviarUazapi(baseUrl, token, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const resp = await fetch(`${baseUrl}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await resp.json().catch(() => ({}));
    const messageId = data.id || data.messageid || data.key?.id || null;
    return { ok: resp.ok && !data.error, data, messageId };
  } catch (e) {
    return { ok: false, data: { error: e instanceof Error ? e.message : String(e) }, messageId: null };
  } finally {
    clearTimeout(timeout);
  }
}

function montarResumo(candidatos, dataRef) {
  const linhas = candidatos.map((c) => {
    const curso = c.curso_nome || 'Curso não informado';
    const prof = c.professor_nome ? ` · Prof. ${c.professor_nome}` : '';
    return `• *${c.nome}* — ${c.unidade_nome}\n   ${curso}${prof}`;
  });
  const n = candidatos.length;
  const cabecalho = n === 1
    ? `🎶 *1 aluno teve a primeira aula ontem* (${fmtData(dataRef)})`
    : `🎶 *${n} alunos tiveram a primeira aula ontem* (${fmtData(dataRef)})`;
  return `${cabecalho}\n\n${linhas.join('\n\n')}\n\n_Pendentes de pesquisa de 1ª aula._`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    let body = {};
    try { body = await req.json(); } catch { /* cron pode mandar body vazio */ }

    // data_ref permite testar um dia específico; por padrão é ontem (BRT).
    const dataRef = body.data_ref || ontemBRT();
    // janela apenas escaneia a RPC; o filtro fino é data_primeira_aula === dataRef.
    const janelaScan = Number.isFinite(body.janela_dias) ? body.janela_dias : 3;
    const numeroDestino = body.numero_destino || NUMERO_FABI;
    const dryRun = body.dry_run === true;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Reaproveita a RPC da aba Pós-1ª Aula (todas as unidades = p_unidade_id NULL).
    const { data: candidatos, error: rpcErr } = await supabase.rpc(
      'get_candidatos_pesquisa_primeira_aula',
      { p_unidade_id: null, p_janela_dias: janelaScan },
    );
    if (rpcErr) {
      return new Response(JSON.stringify({ error: 'rpc_falhou: ' + rpcErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Só quem teve a 1ª aula EXATAMENTE em dataRef (ontem).
    const lista = (candidatos || []).filter((c) => String(c.data_primeira_aula) === dataRef);

    if (lista.length === 0) {
      return new Response(JSON.stringify({ ok: true, enviado: false, motivo: 'sem_primeiras_aulas_ontem', data_ref: dataRef, total: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const texto = montarResumo(lista, dataRef);

    if (dryRun) {
      return new Response(JSON.stringify({ ok: true, dry_run: true, data_ref: dataRef, total: lista.length, destino: numeroDestino, preview: texto }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Credenciais da caixa Sucesso do Aluno
    const { data: caixa, error: caixaError } = await supabase
      .from('whatsapp_caixas')
      .select('id, uazapi_url, uazapi_token')
      .eq('id', CAIXA_SUCESSO_ID)
      .eq('ativo', true)
      .maybeSingle();
    if (caixaError || !caixa) {
      return new Response(JSON.stringify({ error: 'Caixa Sucesso do Aluno nao encontrada/ativa' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    let baseUrl = caixa.uazapi_url || '';
    if (baseUrl && !baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
    baseUrl = baseUrl.replace(/\/+$/, '');
    const token = caixa.uazapi_token;

    const result = await enviarUazapi(baseUrl, token, { number: numeroDestino, text: texto, delay: 500, readchat: true });
    console.log(`[notificar-1a-aula] data_ref=${dataRef} destino=${numeroDestino} total=${lista.length} ok=${result.ok}`, result.data?.error || '');

    return new Response(JSON.stringify({
      ok: result.ok,
      enviado: result.ok,
      data_ref: dataRef,
      total: lista.length,
      destino: numeroDestino,
      erro: result.ok ? null : (result.data?.error || 'falha_envio'),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[notificar-1a-aula] erro:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
