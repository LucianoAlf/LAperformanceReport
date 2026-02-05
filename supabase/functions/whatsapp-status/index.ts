// Edge Function: whatsapp-status
// Verifica status da conexão UAZAPI e envia mensagens de teste
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const UAZAPI_URL = Deno.env.get('UAZAPI_BASE_URL')!;
const UAZAPI_TOKEN = Deno.env.get('UAZAPI_TOKEN')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Formatar número de telefone para o padrão UAZAPI
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

// Verificar status da conexão
async function checkStatus() {
  try {
    let baseUrl = UAZAPI_URL;
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = 'https://' + baseUrl;
    }

    console.log('[whatsapp-status] Verificando status em:', baseUrl);

    const response = await fetch(`${baseUrl}/status`, {
      method: 'GET',
      headers: {
        'token': UAZAPI_TOKEN,
      },
    });

    const data = await response.json();
    console.log('[whatsapp-status] Resposta:', data);

    if (response.ok) {
      return {
        connected: data.status === 'connected' || data.connected === true || data.state === 'CONNECTED',
        phone: data.phone || data.number || data.wid?.user || data.me?.user,
        instanceName: data.instanceName || data.instance,
        raw: data,
      };
    } else {
      return {
        connected: false,
        error: data.error || data.message || 'Erro ao verificar status',
      };
    }
  } catch (error) {
    console.error('[whatsapp-status] Erro:', error);
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Erro de conexão',
    };
  }
}

// Enviar mensagem de teste
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
      headers: {
        'Content-Type': 'application/json',
        'token': UAZAPI_TOKEN,
      },
      body: JSON.stringify({
        number: formattedPhone,
        text: '✅ *Teste de Integração LA Music Report*\n\nWhatsApp conectado com sucesso!\n\n_Esta é uma mensagem automática de teste._',
        delay: 0,
        readchat: true,
      }),
    });

    const data = await response.json();
    console.log('[whatsapp-status] Resposta envio:', data);

    if (response.ok && !data.error) {
      return {
        success: true,
        messageId: data.id || data.messageid || data.key?.id,
        phone: formattedPhone,
      };
    } else {
      return {
        success: false,
        error: data.error || data.message || 'Erro ao enviar mensagem',
      };
    }
  } catch (error) {
    console.error('[whatsapp-status] Erro ao enviar:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro de conexão',
    };
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
            JSON.stringify({ success: false, error: 'Número de telefone é obrigatório' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }
        result = await sendTestMessage(phone);
        break;
      default:
        return new Response(
          JSON.stringify({ error: 'Action inválida. Use: status, test' }),
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
