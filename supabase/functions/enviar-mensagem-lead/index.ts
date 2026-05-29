// Edge Function: enviar-mensagem-lead
// Envia mensagem (texto, imagem, audio, video, documento) para um lead via UAZAPI
// Insere no crm_mensagens e envia via WhatsApp com delay de 2s (digitando...)
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getWhatsAppCredentials } from '../_shared/uazapi.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }
  return cleaned;
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { conversa_id, lead_id, conteudo, tipo = 'texto', remetente = 'andreza', midia_url, midia_mimetype, midia_nome, reply_to_id } = await req.json();

    // Texto obrigatório para tipo texto; mídia obrigatória para outros tipos
    if (!conversa_id || !lead_id) {
      return new Response(
        JSON.stringify({ error: 'conversa_id e lead_id são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tipo === 'texto' && !conteudo) {
      return new Response(
        JSON.stringify({ error: 'conteudo é obrigatório para mensagens de texto' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (['imagem', 'audio', 'video', 'documento'].includes(tipo) && !midia_url) {
      return new Response(
        JSON.stringify({ error: 'midia_url é obrigatório para mensagens de mídia' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Criar cliente Supabase com service role (para bypass RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Buscar telefone do lead, whatsapp_jid e caixa_id da conversa
    const { data: conversa, error: conversaError } = await supabase
      .from('crm_conversas')
      .select('whatsapp_jid, caixa_id, unidade_id, lead:lead_id(telefone, whatsapp, nome)')
      .eq('id', conversa_id)
      .single();

    if (conversaError || !conversa) {
      console.error('[enviar-mensagem-lead] Conversa não encontrada:', conversaError);
      return new Response(
        JSON.stringify({ error: 'Conversa não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lead = conversa.lead as any;
    const telefone = lead?.whatsapp || lead?.telefone;

    if (!telefone) {
      return new Response(
        JSON.stringify({ error: 'Lead sem telefone cadastrado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const numero = conversa.whatsapp_jid || formatPhoneNumber(telefone);

    // 2. Inserir mensagem no banco (status: enviando)
    const { data: mensagem, error: msgError } = await supabase
      .from('crm_mensagens')
      .insert({
        conversa_id,
        lead_id,
        direcao: 'saida',
        tipo,
        conteudo: conteudo || null,
        midia_url: midia_url || null,
        midia_mimetype: midia_mimetype || null,
        midia_nome: midia_nome || null,
        remetente,
        remetente_nome: remetente === 'andreza' ? 'Andreza' : remetente === 'mila' ? 'Mila' : remetente,
        status_entrega: 'enviando',
        is_sistema: false,
        reply_to_id: reply_to_id || null,
      })
      .select('id')
      .single();

    if (msgError) {
      console.error('[enviar-mensagem-lead] Erro ao inserir mensagem:', msgError);
      return new Response(
        JSON.stringify({ error: 'Erro ao salvar mensagem' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[enviar-mensagem-lead] Mensagem ${mensagem.id} inserida. Enviando para ${numero}...`);

    // 3. Resolver credenciais WhatsApp da caixa correta
    const creds = await getWhatsAppCredentials(supabase, {
      funcao: 'agente',
      caixaId: conversa.caixa_id ?? undefined,
      unidadeId: conversa.unidade_id ?? undefined,
    });
    console.log(`[enviar-mensagem-lead] Usando caixa: ${creds.caixaNome} (ID: ${creds.caixaId}, provedor: ${creds.provedor})`);

    // Replyid (UAZAPI apenas)
    let replyid: string | undefined;
    if (reply_to_id) {
      const { data: msgOriginal } = await supabase
        .from('crm_mensagens')
        .select('whatsapp_message_id')
        .eq('id', reply_to_id)
        .maybeSingle();
      if (msgOriginal?.whatsapp_message_id) replyid = msgOriginal.whatsapp_message_id;
    }

    let waResponse: Response;

    if (creds.provedor === 'waha') {
      const chatId = numero.includes('@') ? numero : `${numero}@c.us`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (creds.wahaApiKey) headers['X-Api-Key'] = creds.wahaApiKey;

      let wahaEndpoint: string;
      let wahaBody: Record<string, any> = { session: creds.wahaSession, chatId };

      if (tipo === 'texto') {
        wahaEndpoint = '/api/sendText';
        wahaBody.text = conteudo;
      } else if (tipo === 'imagem') {
        wahaEndpoint = '/api/sendImage';
        wahaBody.file = { url: midia_url };
        wahaBody.caption = conteudo || '';
      } else if (tipo === 'audio') {
        wahaEndpoint = '/api/sendVoice';
        wahaBody.file = { url: midia_url };
      } else if (tipo === 'video') {
        wahaEndpoint = '/api/sendVideo';
        wahaBody.file = { url: midia_url };
        wahaBody.caption = conteudo || '';
      } else {
        wahaEndpoint = '/api/sendFile';
        wahaBody.file = { url: midia_url };
        wahaBody.filename = midia_nome || 'arquivo';
      }

      console.log(`[enviar-mensagem-lead] WAHA endpoint: ${wahaEndpoint}, tipo: ${tipo}`);
      waResponse = await fetch(`${creds.wahaUrl}${wahaEndpoint}`, { method: 'POST', headers, body: JSON.stringify(wahaBody) });
    } else {
      // UAZAPI
      let endpoint = '/send/text';
      let uazapiBody: Record<string, any> = { number: numero, delay: 2000, readchat: true };

      if (tipo === 'texto') {
        uazapiBody.text = conteudo;
        uazapiBody.linkPreview = true;
        if (replyid) uazapiBody.replyid = replyid;
      } else {
        endpoint = '/send/media';
        uazapiBody.file = midia_url;
        uazapiBody.text = conteudo || '';
        switch (tipo) {
          case 'imagem': uazapiBody.type = 'image'; break;
          case 'audio': uazapiBody.type = 'ptt'; break;
          case 'video': uazapiBody.type = 'video'; break;
          case 'documento':
            uazapiBody.type = 'document';
            uazapiBody.docName = midia_nome || 'documento';
            if (midia_mimetype) uazapiBody.mimetype = midia_mimetype;
            break;
          default: uazapiBody.type = 'document'; uazapiBody.docName = midia_nome || 'arquivo';
        }
      }

      console.log(`[enviar-mensagem-lead] UAZAPI endpoint: ${endpoint}, tipo: ${tipo}, body:`, JSON.stringify(uazapiBody).substring(0, 500));
      waResponse = await fetch(`${creds.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': creds.token },
        body: JSON.stringify(uazapiBody),
      });
    }

    const uazapiData = await waResponse.json();
    console.log('[enviar-mensagem-lead] Resposta WhatsApp:', JSON.stringify(uazapiData).substring(0, 300));

    if (waResponse.ok && !uazapiData.error) {
      const whatsappMessageId = uazapiData.id || uazapiData.messageid || uazapiData.key?.id;

      // 4. Atualizar mensagem com ID do WhatsApp e status enviada
      await supabase
        .from('crm_mensagens')
        .update({
          status_entrega: 'enviada',
          whatsapp_message_id: whatsappMessageId,
        })
        .eq('id', mensagem.id);

      // 5. Atualizar whatsapp_jid na conversa se ainda não tiver
      if (!conversa.whatsapp_jid && numero) {
        await supabase
          .from('crm_conversas')
          .update({ whatsapp_jid: numero })
          .eq('id', conversa_id);
      }

      console.log(`[enviar-mensagem-lead] ✅ Mensagem enviada! WhatsApp ID: ${whatsappMessageId}`);

      return new Response(
        JSON.stringify({
          success: true,
          mensagem_id: mensagem.id,
          whatsapp_message_id: whatsappMessageId,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Erro no envio — marcar mensagem como erro
      const errorMsg = uazapiData.error || uazapiData.message || 'Erro ao enviar via WhatsApp';
      console.error('[enviar-mensagem-lead] ❌ Erro WhatsApp:', errorMsg);

      await supabase
        .from('crm_mensagens')
        .update({ status_entrega: 'erro' })
        .eq('id', mensagem.id);

      return new Response(
        JSON.stringify({
          success: false,
          mensagem_id: mensagem.id,
          error: errorMsg,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('[enviar-mensagem-lead] Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
