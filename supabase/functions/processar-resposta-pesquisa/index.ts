// @ts-nocheck
// Recebe webhook UAZAPI de mensagem entrante com buttonOrListid,
// atualiza pesquisas_whatsapp e notifica o gerente da unidade via WhatsApp.
// É chamado internamente pelo webhook-whatsapp-inbox via supabase.functions.invoke.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const DEPARTAMENTO = 'sucesso_aluno';
const JANELA_RESPOSTA_DIAS = 7;

const NOTA_POR_BOTAO = { esperava_mais: 1, foi_ok: 2, gostei: 3, gostei_muito: 4, amei: 5 };
const LABEL_POR_BOTAO = {
  esperava_mais: '⭐ Esperava mais',
  foi_ok: '⭐⭐ Foi ok',
  gostei: '⭐⭐⭐ Gostei',
  gostei_muito: '⭐⭐⭐⭐ Gostei muito',
  amei: '⭐⭐⭐⭐⭐ Amei',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function enviarTexto(baseUrl, token, numero, texto) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(`${baseUrl}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify({ number: numero, text: texto, delay: 500, readchat: true }),
      signal: controller.signal,
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok && !data.error };
  } catch (e) {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json();
    console.log('[processar-resposta] payload keys:', Object.keys(payload || {}).join(', '));

    // Extrair buttonId — campo UAZAPI: message.buttonOrListid
    const msg = payload?.message;
    const buttonId = msg?.buttonOrListid || msg?.buttonsResponseMessage?.selectedButtonId || null;

    if (!buttonId) {
      return new Response(JSON.stringify({ ignorado: true, motivo: 'sem_botao' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const nota = NOTA_POR_BOTAO[buttonId];
    if (nota == null) {
      return new Response(JSON.stringify({ ignorado: true, motivo: 'botao_desconhecido', buttonId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // remoteJid do remetente: msg.chatid no formato UAZAPI
    const remoteJid = msg?.chatid || payload?.key?.remoteJid || null;
    if (!remoteJid) {
      console.error('[processar-resposta] remoteJid ausente');
      return new Response(JSON.stringify({ erro: 'remote_jid_ausente' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Identificar caixa/unidade pelo instanceName ou token do header
    let unidadeId = null;
    let caixaBaseUrl = null;
    let caixaToken = null;

    const instanceName = payload?.instanceName || null;
    const tokenHeader = req.headers.get('token') || req.headers.get('x-apikey') || null;

    const { data: caixa } = await supabase
      .from('whatsapp_caixas')
      .select('id, uazapi_url, uazapi_token, unidade_id')
      .or(
        instanceName
          ? `nome.eq.${instanceName},uazapi_token.eq.${tokenHeader || '__noop__'}`
          : `uazapi_token.eq.${tokenHeader || '__noop__'}`
      )
      .eq('ativo', true)
      .limit(1)
      .maybeSingle();

    if (caixa) {
      unidadeId = caixa.unidade_id;
      let url = caixa.uazapi_url || '';
      if (url && !url.startsWith('http')) url = 'https://' + url;
      caixaBaseUrl = url.replace(/\/+$/, '');
      caixaToken = caixa.uazapi_token;
    }

    // Lookup pesquisa pendente pelo remote_jid.
    // O jid pode chegar em formatos diferentes (número puro OU número@s.whatsapp.net):
    // normaliza para dígitos e casa contra os formatos gravados. NÃO filtra por unidade
    // (o match por número já é específico; o filtro de unidade derrubava a resposta quando
    // a caixa não resolvia a unidade certa — causa do bug de notas zeradas).
    const jidDigitos = String(remoteJid).replace(/\D/g, '');
    const jidsCandidatos = [jidDigitos, `${jidDigitos}@s.whatsapp.net`, `${jidDigitos}@c.us`];
    const limiteEnvio = new Date(Date.now() - JANELA_RESPOSTA_DIAS * 24 * 60 * 60 * 1000).toISOString();
    const { data: pesquisa } = await supabase
      .from('pesquisas_whatsapp')
      .select('id, aluno_id, unidade_id')
      .in('remote_jid', jidsCandidatos)
      .eq('tipo', 'pos_primeira_aula')
      .eq('enviado_ok', true)
      .is('nota', null)
      .gte('enviado_em', limiteEnvio)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pesquisa) {
      console.log('[processar-resposta] pesquisa nao encontrada para jid:', remoteJid);
      return new Response(JSON.stringify({ ignorado: true, motivo: 'pesquisa_nao_encontrada' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Registrar nota
    await supabase
      .from('pesquisas_whatsapp')
      .update({ nota, status: 'respondida', respondido_em: new Date().toISOString() })
      .eq('id', pesquisa.id);

    // Buscar dados do aluno para notificação ao gerente
    const { data: aluno } = await supabase
      .from('alunos')
      .select('nome, cursos(nome)')
      .eq('id', pesquisa.aluno_id)
      .maybeSingle();

    const { data: unidade } = await supabase
      .from('unidades')
      .select('telefone_gerente')
      .eq('id', pesquisa.unidade_id)
      .maybeSingle();

    const telefoneGerente = unidade?.telefone_gerente;
    if (!telefoneGerente) {
      console.warn('[processar-resposta] telefone_gerente nao cadastrado para unidade:', pesquisa.unidade_id);
      return new Response(JSON.stringify({ ok: true, nota, aviso: 'gerente_sem_telefone' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fallback de caixa caso não identificada pelo instanceName/token
    if (!caixaBaseUrl || !caixaToken) {
      const { data: caixaFallback } = await supabase
        .from('whatsapp_caixas')
        .select('uazapi_url, uazapi_token')
        .eq('departamento', DEPARTAMENTO)
        .eq('ativo', true)
        .limit(1)
        .maybeSingle();
      if (caixaFallback) {
        let url = caixaFallback.uazapi_url || '';
        if (url && !url.startsWith('http')) url = 'https://' + url;
        caixaBaseUrl = url.replace(/\/+$/, '');
        caixaToken = caixaFallback.uazapi_token;
      }
    }

    if (caixaBaseUrl && caixaToken) {
      const primeiroNome = (aluno?.nome || 'Aluno').split(' ')[0];
      const cursoNome = aluno?.cursos?.nome || '';
      const labelBotao = LABEL_POR_BOTAO[buttonId] || buttonId;
      const textoGerente = `Feedback de ${primeiroNome}${cursoNome ? ` (${cursoNome})` : ''}: ${labelBotao}`;

      const numGerente = String(telefoneGerente).replace(/[^0-9]/g, '');
      const numFinal = numGerente.startsWith('55') ? numGerente : '55' + numGerente;
      await enviarTexto(caixaBaseUrl, caixaToken, numFinal, textoGerente);
      console.log('[processar-resposta] gerente notificado:', numFinal);
    }

    return new Response(JSON.stringify({ ok: true, nota, pesquisa_id: pesquisa.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[processar-resposta] erro:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
