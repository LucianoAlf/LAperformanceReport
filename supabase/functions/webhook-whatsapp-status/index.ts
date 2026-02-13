// Edge Function: webhook-whatsapp-status
// Recebe webhook da UAZAPI (messages.update) com status de entrega
// Atualiza status_entrega em crm_mensagens (enviada/entregue/lida)
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

// Mapear status UAZAPI para nosso enum
function mapStatus(uazapiStatus: string | number): string | null {
  const statusMap: Record<string, string> = {
    'DELIVERY_ACK': 'entregue',
    'READ': 'lida',
    'PLAYED': 'lida',
    'SERVER_ACK': 'enviada',
    'PENDING': 'enviando',
    'ERROR': 'erro',
    // Status numericos da UAZAPI
    '1': 'enviada',     // SERVER_ACK
    '2': 'entregue',    // DELIVERY_ACK
    '3': 'lida',        // READ
    '4': 'lida',        // PLAYED (audio)
    '5': 'erro',        // ERROR
  };

  const key = String(uazapiStatus).toUpperCase();
  return statusMap[key] || null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log('[webhook-status] Payload:', JSON.stringify(payload).substring(0, 500));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // UAZAPI pode enviar array ou objeto unico
    const updates = Array.isArray(payload) ? payload : payload.data ? [payload.data] : [payload];
    let atualizadas = 0;

    for (const update of updates) {
      try {
        const messageId = update.key?.id || update.id || update.messageId;
        const status = update.status || update.update?.status || update.ack;

        if (!messageId || status === undefined) {
          console.log('[webhook-status] Dados incompletos, ignorando');
          continue;
        }

        const novoStatus = mapStatus(status);
        if (!novoStatus) {
          console.log('[webhook-status] Status desconhecido:', status);
          continue;
        }

        // Atualizar status da mensagem
        const { data, error } = await supabase
          .from('crm_mensagens')
          .update({ status_entrega: novoStatus })
          .eq('whatsapp_message_id', messageId)
          .select('id, conversa_id')
          .maybeSingle();

        if (error) {
          console.error('[webhook-status] Erro ao atualizar:', error);
          continue;
        }

        if (data) {
          atualizadas++;
          console.log(`[webhook-status] Mensagem ${messageId} -> ${novoStatus}`);
        } else {
          console.log(`[webhook-status] Mensagem ${messageId} nao encontrada no banco`);
        }

      } catch (updateErr) {
        console.error('[webhook-status] Erro individual:', updateErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, atualizadas }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[webhook-status] Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
