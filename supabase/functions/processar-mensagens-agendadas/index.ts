// Edge Function: processar-mensagens-agendadas
// Busca mensagens agendadas com status 'pendente' e agendada_para <= agora
// Envia cada uma via a Edge Function enviar-mensagem-lead
// Chamada via Supabase Cron a cada minuto
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const agora = new Date().toISOString();

    // Buscar mensagens pendentes que já passaram do horário agendado
    const { data: mensagens, error: errBusca } = await supabase
      .from('crm_mensagens_agendadas')
      .select('*, conversa:conversa_id(lead_id)')
      .eq('status', 'pendente')
      .lte('agendada_para', agora)
      .order('agendada_para', { ascending: true })
      .limit(20);

    if (errBusca) {
      console.error('[processar-agendadas] Erro ao buscar:', errBusca);
      return new Response(
        JSON.stringify({ error: errBusca.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!mensagens || mensagens.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processadas: 0, mensagem: 'Nenhuma mensagem pendente' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[processar-agendadas] ${mensagens.length} mensagem(ns) para enviar`);

    let enviadas = 0;
    let erros = 0;

    for (const msg of mensagens) {
      try {
        // Marcar como 'enviando' para evitar duplicatas
        await supabase
          .from('crm_mensagens_agendadas')
          .update({ status: 'enviando' })
          .eq('id', msg.id);

        // Chamar a Edge Function de envio
        const response = await fetch(`${SUPABASE_URL}/functions/v1/enviar-mensagem-lead`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            conversa_id: msg.conversa_id,
            lead_id: msg.lead_id,
            conteudo: msg.conteudo,
            tipo: msg.tipo || 'texto',
            remetente: msg.criado_por || 'andreza',
          }),
        });

        if (response.ok) {
          await supabase
            .from('crm_mensagens_agendadas')
            .update({ status: 'enviada', enviada_em: new Date().toISOString() })
            .eq('id', msg.id);
          enviadas++;
          console.log(`[processar-agendadas] ✅ Msg ${msg.id} enviada`);
        } else {
          const errBody = await response.text();
          await supabase
            .from('crm_mensagens_agendadas')
            .update({ status: 'erro', erro: errBody })
            .eq('id', msg.id);
          erros++;
          console.error(`[processar-agendadas] ❌ Msg ${msg.id} erro:`, errBody);
        }
      } catch (errMsg) {
        await supabase
          .from('crm_mensagens_agendadas')
          .update({ status: 'erro', erro: String(errMsg) })
          .eq('id', msg.id);
        erros++;
        console.error(`[processar-agendadas] ❌ Msg ${msg.id} exceção:`, errMsg);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processadas: mensagens.length, enviadas, erros }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[processar-agendadas] Erro geral:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
