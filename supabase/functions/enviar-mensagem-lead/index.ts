// Edge Function: enviar-mensagem-lead
// Envia mensagem de texto para um lead via UAZAPI
// Insere no crm_mensagens e envia via WhatsApp com delay de 2s (digitando...)
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const UAZAPI_URL = Deno.env.get('UAZAPI_BASE_URL')!;
const UAZAPI_TOKEN = Deno.env.get('UAZAPI_TOKEN')!;

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
    const { conversa_id, lead_id, conteudo, tipo = 'texto', remetente = 'andreza' } = await req.json();

    if (!conversa_id || !lead_id || !conteudo) {
      return new Response(
        JSON.stringify({ error: 'conversa_id, lead_id e conteudo são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Criar cliente Supabase com service role (para bypass RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Buscar telefone do lead e whatsapp_jid da conversa
    const { data: conversa, error: conversaError } = await supabase
      .from('crm_conversas')
      .select('whatsapp_jid, lead:lead_id(telefone, whatsapp, nome)')
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
        conteudo,
        remetente,
        remetente_nome: remetente === 'andreza' ? 'Andreza' : remetente === 'mila' ? 'Mila' : remetente,
        status_entrega: 'enviando',
        is_sistema: false,
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

    // 3. Enviar via UAZAPI com delay de 2 segundos (mostra "digitando...")
    let baseUrl = UAZAPI_URL;
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = 'https://' + baseUrl;
    }

    const uazapiResponse = await fetch(`${baseUrl}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': UAZAPI_TOKEN,
      },
      body: JSON.stringify({
        number: numero,
        text: conteudo,
        delay: 2000,
        readchat: true,
        linkPreview: true,
      }),
    });

    const uazapiData = await uazapiResponse.json();
    console.log('[enviar-mensagem-lead] Resposta UAZAPI:', JSON.stringify(uazapiData).substring(0, 300));

    if (uazapiResponse.ok && !uazapiData.error) {
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
      const errorMsg = uazapiData.error || uazapiData.message || 'Erro ao enviar via UAZAPI';
      console.error('[enviar-mensagem-lead] ❌ Erro UAZAPI:', errorMsg);

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
