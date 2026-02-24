// Edge Function: reagir-mensagem
// Envia uma reação (emoji) a uma mensagem via UAZAPI /message/react
// Salva a reação no campo reacoes (JSONB) da crm_mensagens
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
    const { mensagem_id, emoji } = await req.json();

    if (!mensagem_id) {
      return new Response(
        JSON.stringify({ error: 'mensagem_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (emoji === undefined || emoji === null) {
      return new Response(
        JSON.stringify({ error: 'emoji é obrigatório (string vazia para remover)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Buscar mensagem e conversa
    const { data: mensagem, error: msgError } = await supabase
      .from('crm_mensagens')
      .select('id, whatsapp_message_id, conversa_id, reacoes')
      .eq('id', mensagem_id)
      .single();

    if (msgError || !mensagem) {
      return new Response(
        JSON.stringify({ error: 'Mensagem não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!mensagem.whatsapp_message_id) {
      return new Response(
        JSON.stringify({ error: 'Mensagem sem ID do WhatsApp' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar o JID da conversa + dados para resolver credenciais
    const { data: conversa } = await supabase
      .from('crm_conversas')
      .select('whatsapp_jid, caixa_id, unidade_id')
      .eq('id', mensagem.conversa_id)
      .single();

    if (!conversa?.whatsapp_jid) {
      return new Response(
        JSON.stringify({ error: 'Conversa sem JID do WhatsApp' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Resolver credenciais UAZAPI via caixa da conversa
    const creds = await getUazapiCredentials(supabase, { funcao: 'agente', caixaId: conversa?.caixa_id ?? undefined, unidadeId: conversa?.unidade_id ?? undefined });

    console.log(`[reagir-mensagem] Reagindo com "${emoji}" na msg ${mensagem.whatsapp_message_id} (caixa: ${creds.caixaNome})`);

    const uazapiResponse = await fetch(`${creds.baseUrl}/message/react`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': creds.token,
      },
      body: JSON.stringify({
        number: conversa.whatsapp_jid,
        text: emoji,
        id: mensagem.whatsapp_message_id,
      }),
    });

    const uazapiData = await uazapiResponse.json();
    console.log('[reagir-mensagem] Resposta UAZAPI:', JSON.stringify(uazapiData).substring(0, 300));

    if (uazapiResponse.ok && uazapiData.success) {
      // 3. Atualizar reações no banco
      const reacoesAtuais = Array.isArray(mensagem.reacoes) ? mensagem.reacoes : [];

      let novasReacoes;
      if (emoji === '') {
        // Remover reação do operador
        novasReacoes = reacoesAtuais.filter((r: any) => r.de !== 'operador');
      } else {
        // Adicionar/atualizar reação do operador
        const semMinhaReacao = reacoesAtuais.filter((r: any) => r.de !== 'operador');
        novasReacoes = [...semMinhaReacao, { emoji, de: 'operador', timestamp: Date.now() }];
      }

      await supabase
        .from('crm_mensagens')
        .update({ reacoes: novasReacoes })
        .eq('id', mensagem_id);

      console.log(`[reagir-mensagem] ✅ Reação salva: ${emoji || '(removida)'}`);

      return new Response(
        JSON.stringify({ success: true, reacoes: novasReacoes }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const errorMsg = uazapiData.error || uazapiData.message || 'Erro ao reagir via UAZAPI';
      console.error('[reagir-mensagem] ❌ Erro UAZAPI:', errorMsg);

      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('[reagir-mensagem] Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
