// Edge Function: disparar-pesquisa-1a-aula-auto
// Auto-disparo (opt-in) da pesquisa de 1ª aula para quem fez a 1ª aula ONTEM (BRT).
// Gated pelo toggle automacoes_config(slug='auto_pesquisa_1a_aula'). Teto 15/dia; acima
// disso, dispara 15 e avisa a Fabi (caixa 3) pra completar o resto na aba Pós-1ª Aula.
// Reaproveita a edge enviar-pesquisa-pos-primeira-aula (1/1 com 10s, idempotente).
// Responde rápido ao cron; o envio real roda em EdgeRuntime.waitUntil.
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CAIXA_SUCESSO_ID = 3;
const NUMERO_FABI = '5521994696489';
const TETO_DIARIO = 15;
const SLUG_CONFIG = 'auto_pesquisa_1a_aula';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Envia um texto simples pela caixa Sucesso do Aluno (id=3). Usado só para avisar a Fabi.
async function avisarFabi(supabase, texto) {
  try {
    const { data: caixa } = await supabase
      .from('whatsapp_caixas')
      .select('uazapi_url, uazapi_token')
      .eq('id', CAIXA_SUCESSO_ID).eq('ativo', true).maybeSingle();
    if (!caixa) return;
    let baseUrl = caixa.uazapi_url || '';
    if (baseUrl && !baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
    baseUrl = baseUrl.replace(/\/+$/, '');
    await fetch(`${baseUrl}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: caixa.uazapi_token },
      body: JSON.stringify({ number: NUMERO_FABI, text: texto, delay: 500, readchat: true }),
    });
  } catch (e) {
    console.error('[disparar-pesquisa-auto] avisarFabi erro:', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    let body = {};
    try { body = await req.json(); } catch { /* cron manda body vazio */ }
    const dryRun = body.dry_run === true;
    const forcar = body.forcar === true;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Kill switch
    const { data: cfg } = await supabase
      .from('automacoes_config').select('ativo').eq('slug', SLUG_CONFIG).maybeSingle();
    const ativo = cfg?.ativo === true;
    if (!ativo && !forcar) {
      return json({ ok: true, enviado: false, motivo: 'auto_desligado' });
    }

    // 2) Candidatos de ontem (todas as unidades)
    const { data: candidatos, error: rpcErr } = await supabase.rpc(
      'get_candidatos_pesquisa_primeira_aula',
      { p_unidade_id: null, p_janela_dias: 1, p_apenas_ontem: true },
    );
    if (rpcErr) return json({ ok: false, erro: 'rpc_falhou: ' + rpcErr.message }, 500);

    const comContato = (candidatos || []).filter((c) => c.whatsapp_jid);
    const lote = comContato.slice(0, TETO_DIARIO);
    const excedente = comContato.length - lote.length;

    if (comContato.length === 0) {
      return json({ ok: true, enviado: false, motivo: 'sem_candidatos', total: 0 });
    }

    if (dryRun) {
      return json({
        ok: true, dry_run: true, total: comContato.length,
        disparariam: lote.length, excedente, alunos: lote.map((c) => c.nome),
      });
    }

    // 3) Dispara em background (a edge de envio leva ~10s por aluno). Responde já ao cron.
    const tarefa = (async () => {
      const payload = {
        alunos: lote.map((a) => ({
          aluno_id: a.aluno_id, unidade_id: a.unidade_id, whatsapp_jid: a.whatsapp_jid,
          nome: a.nome, curso: a.curso_nome, data_matricula: a.data_matricula,
        })),
      };
      const { data: envio, error: envErr } = await supabase.functions.invoke(
        'enviar-pesquisa-pos-primeira-aula', { body: payload },
      );
      const resultados = (envio && envio.resultados) || [];
      const enviados = resultados.filter((r) => r.ok).length;
      console.log(`[disparar-pesquisa-auto] disparados=${lote.length} enviados=${enviados} excedente=${excedente}`, envErr?.message || '');

      if (excedente > 0) {
        await avisarFabi(
          supabase,
          `⚠️ *Auto-disparo da pesquisa de 1ª aula*\n\nDisparei ${enviados} pesquisa(s) hoje (teto de ${TETO_DIARIO}/dia).\nAinda restam *${excedente}* na aba *Pós-1ª Aula* — dispare quando puder. 🙏`,
        );
      }
    })();

    // @ts-ignore — EdgeRuntime existe no runtime Supabase
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(tarefa);
    } else {
      await tarefa;
    }

    return json({ ok: true, enviado: true, total: comContato.length, disparados: lote.length, excedente });
  } catch (err) {
    console.error('[disparar-pesquisa-auto] erro:', err);
    return json({ ok: false, erro: err instanceof Error ? err.message : 'Erro interno' }, 500);
  }
});
