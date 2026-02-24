// Edge Function: whatsapp-status
// Verifica status da conexao UAZAPI e envia mensagens de teste
// Agora resolve credenciais da tabela whatsapp_caixas via caixa_id
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

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  if (!cleaned.startsWith('55')) cleaned = '55' + cleaned;
  return cleaned;
}

// Detectar se esta conectado baseado no formato real da UAZAPI
function isConnected(data: any): boolean {
  if (data?.status?.checked_instance?.connection_status === 'connected') return true;
  if (data?.status === 'connected') return true;
  if (data?.connected === true) return true;
  if (data?.state === 'CONNECTED') return true;
  if (data?.status?.server_status === 'running' && data?.status?.checked_instance?.is_healthy === true) return true;
  return false;
}

function extractPhone(data: any): string | undefined {
  return data?.phone || data?.number || data?.wid?.user || data?.me?.user || data?.status?.checked_instance?.name;
}

function extractInstance(data: any): string | undefined {
  return data?.instanceName || data?.instance || data?.status?.checked_instance?.name;
}

async function checkStatus(baseUrl: string, token: string) {
  try {
    console.log('[whatsapp-status] Verificando status em:', baseUrl);

    const response = await fetch(`${baseUrl}/status`, {
      method: 'GET',
      headers: { 'token': token },
    });

    const data = await response.json();
    console.log('[whatsapp-status] Resposta:', JSON.stringify(data).substring(0, 500));

    if (response.ok) {
      const connected = isConnected(data);
      return {
        connected,
        phone: extractPhone(data),
        instanceName: extractInstance(data),
        raw: data,
      };
    } else {
      return { connected: false, error: data.error || data.message || 'Erro ao verificar status' };
    }
  } catch (error) {
    console.error('[whatsapp-status] Erro:', error);
    return { connected: false, error: error instanceof Error ? error.message : 'Erro de conexao' };
  }
}

async function sendTestMessage(phone: string, baseUrl: string, token: string) {
  try {
    const formattedPhone = formatPhoneNumber(phone);
    console.log('[whatsapp-status] Enviando teste para:', formattedPhone);

    const response = await fetch(`${baseUrl}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': token },
      body: JSON.stringify({
        number: formattedPhone,
        text: '✅ *Teste de Integracao LA Music Report*\n\nWhatsApp conectado com sucesso!\n\n_Esta e uma mensagem automatica de teste._',
        delay: 0,
        readchat: true,
      }),
    });

    const data = await response.json();
    console.log('[whatsapp-status] Resposta envio:', JSON.stringify(data).substring(0, 300));

    if (response.ok && !data.error) {
      return { success: true, messageId: data.id || data.messageid || data.key?.id, phone: formattedPhone };
    } else {
      return { success: false, error: data.error || data.message || 'Erro ao enviar mensagem' };
    }
  } catch (error) {
    console.error('[whatsapp-status] Erro ao enviar:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Erro de conexao' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, phone, caixa_id } = await req.json();

    // Resolver credenciais da caixa
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const creds = await getUazapiCredentials(supabase, {
      caixaId: caixa_id ?? undefined,
    });
    console.log(`[whatsapp-status] Usando caixa: ${creds.caixaNome} (ID: ${creds.caixaId})`);

    let result;

    switch (action) {
      case 'status':
        result = await checkStatus(creds.baseUrl, creds.token);
        break;
      case 'test':
        if (!phone) {
          return new Response(
            JSON.stringify({ success: false, error: 'Numero de telefone e obrigatorio' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
        result = await sendTestMessage(phone, creds.baseUrl, creds.token);
        break;
      default:
        return new Response(
          JSON.stringify({ error: 'Action invalida. Use: status, test' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }

    return new Response(
      JSON.stringify({ success: true, ...result, caixa: creds.caixaNome, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[whatsapp-status] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
