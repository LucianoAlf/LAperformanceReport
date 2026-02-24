// Edge Function: editar-mensagem-lead
// Edita uma mensagem já enviada via UAZAPI /message/edit
// Atualiza o conteúdo no crm_mensagens
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
    const { mensagem_id, novo_conteudo } = await req.json();

    if (!mensagem_id || !novo_conteudo?.trim()) {
      return new Response(
        JSON.stringify({ error: 'mensagem_id e novo_conteudo são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Buscar mensagem para pegar o whatsapp_message_id
    const { data: mensagem, error: msgError } = await supabase
      .from('crm_mensagens')
      .select('id, whatsapp_message_id, direcao, tipo, conteudo, conversa_id')
      .eq('id', mensagem_id)
      .single();

    if (msgError || !mensagem) {
      console.error('[editar-mensagem-lead] Mensagem não encontrada:', msgError);
      return new Response(
        JSON.stringify({ error: 'Mensagem não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validações
    if (mensagem.direcao !== 'saida') {
      return new Response(
        JSON.stringify({ error: 'Só é possível editar mensagens enviadas' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (mensagem.tipo !== 'texto') {
      return new Response(
        JSON.stringify({ error: 'Só é possível editar mensagens de texto' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!mensagem.whatsapp_message_id) {
      return new Response(
        JSON.stringify({ error: 'Mensagem sem ID do WhatsApp (ainda não foi enviada)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Buscar conversa para resolver credenciais UAZAPI
    const { data: conversa } = await supabase
      .from('crm_conversas')
      .select('caixa_id, unidade_id')
      .eq('id', mensagem.conversa_id)
      .single();

    const creds = await getUazapiCredentials(supabase, { funcao: 'agente', caixaId: conversa?.caixa_id ?? undefined, unidadeId: conversa?.unidade_id ?? undefined });

    console.log(`[editar-mensagem-lead] Editando mensagem ${mensagem.whatsapp_message_id} (caixa: ${creds.caixaNome})...`);

    const uazapiResponse = await fetch(`${creds.baseUrl}/message/edit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': creds.token,
      },
      body: JSON.stringify({
        id: mensagem.whatsapp_message_id,
        text: novo_conteudo.trim(),
      }),
    });

    const uazapiData = await uazapiResponse.json();
    console.log('[editar-mensagem-lead] Resposta UAZAPI:', JSON.stringify(uazapiData).substring(0, 300));

    if (uazapiResponse.ok && !uazapiData.error) {
      // 3. Atualizar conteúdo no banco
      const { error: updateError } = await supabase
        .from('crm_mensagens')
        .update({
          conteudo: novo_conteudo.trim(),
          editada: true,
        })
        .eq('id', mensagem_id);

      if (updateError) {
        console.error('[editar-mensagem-lead] Erro ao atualizar banco:', updateError);
      }

      console.log(`[editar-mensagem-lead] ✅ Mensagem editada com sucesso!`);

      return new Response(
        JSON.stringify({ success: true, mensagem_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const errorMsg = uazapiData.error || uazapiData.message || 'Erro ao editar via UAZAPI';
      console.error('[editar-mensagem-lead] ❌ Erro UAZAPI:', errorMsg);

      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('[editar-mensagem-lead] Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
