// Edge Function: disparar-pesquisa-1a-aula-auto
// Auto-disparo (opt-in) da pesquisa de 1ª aula para quem fez a 1ª aula ONTEM (BRT).
// Gated pelo toggle automacoes_config(slug='auto_pesquisa_1a_aula'). Teto 15/dia; acima
// disso, dispara 15 e avisa a Fabi (caixa 3) pra completar o resto na aba Pós-1ª Aula.
// Reaproveita a edge enviar-pesquisa-pos-primeira-aula (1/1 com 10s, idempotente).
// Responde rápido ao cron; o envio real roda em EdgeRuntime.waitUntil.
// - Retry automático só nos que falharam (idempotente: quem recebeu é pulado). Se ainda
//   sobrar falha, avisa a Fabi COM A LISTA de quem não recebeu (recuperação na aba).
// - Modo teste (forcar) fura o kill switch — restrito a Hugo/Luciano (gate por e-mail,
//   mesmo mecanismo do Tráfego Pago), pois a anon key é pública.
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CAIXA_SUCESSO_ID = 3;
const NUMERO_FABI = '5521994696489';
const TETO_DIARIO = 15;
const SLUG_CONFIG = 'auto_pesquisa_1a_aula';

// Modo teste (forcar) só pode ser usado por estes e-mails (espelha o gate do Tráfego Pago).
const EMAILS_AUTORIZADOS = new Set(['hugo@gmail.com', 'lucianoalf.la@gmail.com']);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Extrai o e-mail do payload do JWT (assinatura já validada pelo verify_jwt do gateway).
function emailDoJwt(authHeader) {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  try {
    const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return (payload.email ?? payload.user_metadata?.email ?? null)?.toLowerCase() ?? null;
  } catch {
    return null;
  }
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

    // O modo teste (forcar) fura o kill switch → restrito a Hugo/Luciano.
    if (forcar) {
      const email = emailDoJwt(req.headers.get('authorization'));
      if (!email || !EMAILS_AUTORIZADOS.has(email)) {
        return json({ ok: false, erro: 'modo teste (forcar) restrito a usuários autorizados' }, 403);
      }
    }

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
    const mapAluno = (a) => ({
      aluno_id: a.aluno_id, unidade_id: a.unidade_id, whatsapp_jid: a.whatsapp_jid,
      nome: a.nome, curso: a.curso_nome, data_matricula: a.data_matricula,
    });

    const enviarLote = async (alunos) => {
      const { data: envio, error: envErr } = await supabase.functions.invoke(
        'enviar-pesquisa-pos-primeira-aula', { body: { alunos: alunos.map(mapAluno) } },
      );
      if (envErr) console.error('[disparar-pesquisa-auto] invoke erro:', envErr.message);
      return (envio && envio.resultados) || [];
    };

    const tarefa = (async () => {
      // 1ª tentativa
      const r1 = await enviarLote(lote);
      const okIds = new Set(r1.filter((r) => r.ok).map((r) => r.aluno_id));

      // Retry SÓ nos que falharam (idempotente: quem já recebeu é pulado pela edge/RPC).
      const falharam1 = lote.filter((a) => !okIds.has(a.aluno_id));
      if (falharam1.length > 0) {
        await new Promise((r) => setTimeout(r, 5000));
        const r2 = await enviarLote(falharam1);
        for (const r of r2) if (r.ok) okIds.add(r.aluno_id);
      }

      const naoEnviados = lote.filter((a) => !okIds.has(a.aluno_id));
      const enviados = okIds.size;
      console.log(`[disparar-pesquisa-auto] enviados=${enviados}/${lote.length} excedente=${excedente} falhas=${naoEnviados.length}`);

      // Aviso à Fabi: excedente (acima do teto) e/ou falhas de envio (com a lista pra recuperar).
      const blocos = [];
      if (excedente > 0) {
        blocos.push(`Fiquei no teto de ${TETO_DIARIO}/dia — restam *${excedente}* na aba *Pós-1ª Aula* pra você disparar. 🙏`);
      }
      if (naoEnviados.length > 0) {
        const nomes = naoEnviados.map((a) => `• ${a.nome}`).join('\n');
        blocos.push(`⚠️ *${naoEnviados.length}* não receberam (falha no envio) — dispare na aba:\n${nomes}`);
      }
      if (blocos.length > 0) {
        await avisarFabi(supabase, `*Auto-disparo da pesquisa de 1ª aula*\nEnviei ${enviados} hoje.\n\n${blocos.join('\n\n')}`);
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
