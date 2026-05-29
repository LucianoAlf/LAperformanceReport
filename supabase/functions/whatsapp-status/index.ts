// Edge Function: whatsapp-status v15
// Verifica status de conexão e envia mensagens de teste
// Suporta UAZAPI e WAHA (provedor detectado via tabela whatsapp_caixas)
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

function formatPhone(phone: string): string {
  let c = phone.replace(/\D/g, '');
  if (c.startsWith('0')) c = c.substring(1);
  if (!c.startsWith('55')) c = '55' + c;
  return c;
}

// ─── UAZAPI ───────────────────────────────────────────────────────────────────

function isConnectedUazapi(data: any): boolean {
  if (data?.status?.checked_instance?.connection_status === 'connected') return true;
  if (data?.status === 'connected') return true;
  if (data?.connected === true) return true;
  if (data?.state === 'CONNECTED') return true;
  if (data?.status?.server_status === 'running' && data?.status?.checked_instance?.is_healthy === true) return true;
  return false;
}

async function checkStatusUazapi(baseUrl: string, token: string) {
  try {
    const resp = await fetch(`${baseUrl}/status`, {
      method: 'GET',
      headers: { token },
    });
    const data = await resp.json();
    console.log('[uazapi status]', resp.status, JSON.stringify(data).slice(0, 300));
    return {
      connected: isConnectedUazapi(data),
      phone: data?.phone || data?.number || data?.wid?.user || data?.status?.checked_instance?.name,
      instanceName: data?.instanceName || data?.instance,
      raw: data,
    };
  } catch (e: any) {
    console.error('[uazapi status] fetch error:', e.message);
    return { connected: false, error: e.message };
  }
}

async function sendTestUazapi(phone: string, baseUrl: string, token: string) {
  const formatted = formatPhone(phone);
  const resp = await fetch(`${baseUrl}/send/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token },
    body: JSON.stringify({
      number: formatted,
      text: '✅ *Teste de Integração LA Music Report*\n\nWhatsApp conectado com sucesso!\n\n_Mensagem automática de teste._',
      delay: 0,
      readchat: true,
    }),
  });
  const data = await resp.json();
  if (resp.ok && !data.error) {
    return { success: true, messageId: data.id || data.messageid || data.key?.id, phone: formatted };
  }
  return { success: false, error: data.error || data.message || 'Erro ao enviar' };
}

// ─── WAHA ─────────────────────────────────────────────────────────────────────

async function checkStatusWaha(wahaUrl: string, wahaSession: string, apiKey?: string) {
  const url = `${wahaUrl.replace(/\/+$/, '')}/api/sessions/${wahaSession}`;
  console.log('[waha status] GET', url, apiKey ? '(com X-Api-Key)' : '(sem auth)');
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-Api-Key'] = apiKey;

    const resp = await fetch(url, { method: 'GET', headers });
    const httpStatus = resp.status;
    let data: any;
    const bodyText = await resp.text();
    try { data = JSON.parse(bodyText); } catch { data = { _rawBody: bodyText.slice(0, 200) }; }
    console.log('[waha status] HTTP', httpStatus, JSON.stringify(data).slice(0, 300));

    const connected = data?.status === 'WORKING';
    const phone = data?.me?.id ? data.me.id.split('@')[0] : undefined;
    return { connected, phone, instanceName: data?.name, httpStatus, raw: data };
  } catch (e: any) {
    console.error('[waha status] fetch error:', e.message);
    return { connected: false, httpStatus: 0, error: e.message };
  }
}

async function sendTestWaha(phone: string, wahaUrl: string, wahaSession: string, apiKey?: string) {
  const formatted = formatPhone(phone);
  const url = `${wahaUrl.replace(/\/+$/, '')}/api/sendText`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-Api-Key'] = apiKey;

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      session: wahaSession,
      chatId: `${formatted}@c.us`,
      text: '✅ *Teste de Integração LA Music Report*\n\nWhatsApp conectado com sucesso!\n\n_Mensagem automática de teste._',
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (resp.ok) {
    return { success: true, messageId: data?.id || data?.key?.id, phone: formatted };
  }
  return { success: false, error: data?.error || data?.message || `HTTP ${resp.status}` };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, phone, caixa_id } = await req.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: caixa, error: caixaErr } = await supabase
      .from('whatsapp_caixas')
      .select('id, nome, provedor, uazapi_url, uazapi_token, waha_url, waha_session, waha_api_key')
      .eq('id', caixa_id)
      .eq('ativo', true)
      .maybeSingle();

    if (caixaErr || !caixa) {
      return new Response(
        JSON.stringify({ connected: false, error: `Caixa ${caixa_id} não encontrada` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[whatsapp-status] Caixa: ${caixa.nome} (provedor=${caixa.provedor})`);

    let result: any;
    const provedor = caixa.provedor || 'uazapi';

    if (provedor === 'waha') {
      const wahaUrl = caixa.waha_url;
      const wahaSession = caixa.waha_session;
      // uazapi_token reaproveitado como API key para WAHA quando preenchido
      const apiKey = caixa.waha_api_key || undefined;

      if (!wahaUrl || !wahaSession) {
        return new Response(
          JSON.stringify({ connected: false, error: 'waha_url ou waha_session não configurados' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (action === 'status') {
        result = await checkStatusWaha(wahaUrl, wahaSession, apiKey);
      } else if (action === 'test') {
        if (!phone) {
          return new Response(
            JSON.stringify({ success: false, error: 'Número de telefone obrigatório' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
          );
        }
        result = await sendTestWaha(phone, wahaUrl, wahaSession, apiKey);
      }
    } else {
      // UAZAPI
      let baseUrl = caixa.uazapi_url || '';
      if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
      baseUrl = baseUrl.replace(/\/+$/, '');
      const token = caixa.uazapi_token;

      if (action === 'status') {
        result = await checkStatusUazapi(baseUrl, token);
      } else if (action === 'test') {
        if (!phone) {
          return new Response(
            JSON.stringify({ success: false, error: 'Número de telefone obrigatório' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
          );
        }
        result = await sendTestUazapi(phone, baseUrl, token);
      } else {
        return new Response(
          JSON.stringify({ error: 'Action inválida. Use: status, test' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, ...result, caixa: caixa.nome, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[whatsapp-status] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
