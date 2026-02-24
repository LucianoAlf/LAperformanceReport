// Edge Function: deletar-mensagem-lead
// Deleta uma mensagem enviada via UAZAPI /message/delete
// Marca a mensagem como deletada no crm_mensagens
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUazapiCredentials } from '../_shared/uazapi.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { mensagem_id } = await req.json();

    if (!mensagem_id) {
      return new Response(
        JSON.stringify({ error: 'mensagem_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Buscar mensagem para pegar o whatsapp_message_id
    const { data: mensagem, error: msgError } = await supabase
      .from('crm_mensagens')
      .select('id, whatsapp_message_id, direcao, status_entrega, conversa_id')
      .eq('id', mensagem_id)
      .single();

    if (msgError || !mensagem) {
      console.error('[deletar-mensagem-lead] Mensagem não encontrada:', msgError);
      return new Response(
        JSON.stringify({ error: 'Mensagem não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (mensagem.direcao !== 'saida') {
      return new Response(
        JSON.stringify({ error: 'Só é possível deletar mensagens enviadas' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!mensagem.whatsapp_message_id) {
      // Mensagem sem ID do WhatsApp — deletar apenas do banco
      await supabase
        .from('crm_mensagens')
        .update({ deletada: true, conteudo: null })
        .eq('id', mensagem_id);

      return new Response(
        JSON.stringify({ success: true, mensagem_id, local_only: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Buscar conversa para resolver credenciais UAZAPI
    const { data: conversa } = await supabase
      .from('crm_conversas')
      .select('caixa_id, unidade_id')
      .eq('id', mensagem.conversa_id)
      .single();

    const creds = await getUazapiCredentials(supabase, { funcao: 'agente', caixaId: conversa?.caixa_id ?? undefined, unidadeId: conversa?.unidade_id ?? undefined });

    console.log(`[deletar-mensagem-lead] Deletando mensagem ${mensagem.whatsapp_message_id} (caixa: ${creds.caixaNome})...`);

    const uazapiResponse = await fetch(`${creds.baseUrl}/message/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': creds.token,
      },
      body: JSON.stringify({
        id: mensagem.whatsapp_message_id,
      }),
    });

    const uazapiData = await uazapiResponse.json();
    console.log('[deletar-mensagem-lead] Resposta UAZAPI:', JSON.stringify(uazapiData).substring(0, 300));

    if (uazapiResponse.ok && !uazapiData.error) {
      // 3. Marcar como deletada no banco
      await supabase
        .from('crm_mensagens')
        .update({ deletada: true, conteudo: null })
        .eq('id', mensagem_id);

      console.log(`[deletar-mensagem-lead] ✅ Mensagem deletada com sucesso!`);

      return new Response(
        JSON.stringify({ success: true, mensagem_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const errorMsg = uazapiData.error || uazapiData.message || 'Erro ao deletar via UAZAPI';
      console.error('[deletar-mensagem-lead] ❌ Erro UAZAPI:', errorMsg);

      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('[deletar-mensagem-lead] Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
