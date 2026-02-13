// Edge Function: whatsapp-status
// Verifica status da conexao UAZAPI e envia mensagens de teste
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const UAZAPI_URL = Deno.env.get('UAZAPI_BASE_URL')!;
const UAZAPI_TOKEN = Deno.env.get('UAZAPI_TOKEN')!;

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
  // Formato 1: { status: { checked_instance: { connection_status: 'connected' } } }
  if (data?.status?.checked_instance?.connection_status === 'connected') return true;
  // Formato 2: { status: 'connected' }
  if (data?.status === 'connected') return true;
  // Formato 3: { connected: true }
  if (data?.connected === true) return true;
  // Formato 4: { state: 'CONNECTED' }
  if (data?.state === 'CONNECTED') return true;
  // Formato 5: { server_status: 'running' } com instancia saudavel
  if (data?.status?.server_status === 'running' && data?.status?.checked_instance?.is_healthy === true) return true;
  return false;
}

// Extrair telefone da resposta
function extractPhone(data: any): string | undefined {
  return data?.phone || data?.number || data?.wid?.user || data?.me?.user || data?.status?.checked_instance?.name;
}

// Extrair nome da instancia
function extractInstance(data: any): string | undefined {
  return data?.instanceName || data?.instance || data?.status?.checked_instance?.name;
}

async function checkStatus() {
  try {
    let baseUrl = UAZAPI_URL;
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = 'https://' + baseUrl;
    }
    console.log('[whatsapp-status] Verificando status em:', baseUrl);

    const response = await fetch(`${baseUrl}/status`, {
      method: 'GET',
      headers: { 'token': UAZAPI_TOKEN },
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

async function sendTestMessage(phone: string) {
  try {
    const formattedPhone = formatPhoneNumber(phone);
    let baseUrl = UAZAPI_URL;
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = 'https://' + baseUrl;
    }
    console.log('[whatsapp-status] Enviando teste para:', formattedPhone);

    const response = await fetch(`${baseUrl}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': UAZAPI_TOKEN },
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
    const { action, phone } = await req.json();
    let result;

    switch (action) {
      case 'status':
        result = await checkStatus();
        break;
      case 'test':
        if (!phone) {
          return new Response(
            JSON.stringify({ success: false, error: 'Numero de telefone e obrigatorio' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
        result = await sendTestMessage(phone);
        break;
      default:
        return new Response(
          JSON.stringify({ error: 'Action invalida. Use: status, test' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }

    return new Response(
      JSON.stringify({ success: true, ...result, timestamp: new Date().toISOString() }),
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
