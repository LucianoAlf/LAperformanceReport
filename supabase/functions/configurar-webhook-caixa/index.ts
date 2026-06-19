// Edge Function: configurar-webhook-caixa
// Configura automaticamente o webhook de recebimento na instância UAZAPI da caixa,
// apontando para webhook-whatsapp-inbox?caixa_id=<id> (eventos messages + messages_update).
// Evita a configuração manual e o erro de webhook ausente/desabilitado.
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { caixa_id } = await req.json();
    if (!caixa_id) return json({ error: 'caixa_id é obrigatório' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: caixa, error } = await supabase
      .from('whatsapp_caixas')
      .select('id, nome, provedor, uazapi_url, uazapi_token')
      .eq('id', caixa_id)
      .maybeSingle();

    if (error || !caixa) return json({ error: 'Caixa não encontrada' }, 404);

    // URL que a instância deve chamar quando chegar mensagem (com o caixa_id desta caixa)
    const webhookUrl = `${SUPABASE_URL}/functions/v1/webhook-whatsapp-inbox?caixa_id=${caixa.id}`;
    const provedor = caixa.provedor || 'uazapi';

    if (provedor !== 'uazapi') {
      // WAHA configura webhook por sessão (estrutura diferente) — não suportado automaticamente ainda.
      return json({ success: false, provedor, webhook_url: webhookUrl, message: 'Configuração automática só disponível para UAZAPI. Para WAHA, configure manualmente.' });
    }

    let base = caixa.uazapi_url || '';
    if (!base.startsWith('http://') && !base.startsWith('https://')) base = 'https://' + base;
    base = base.replace(/\/+$/, '');

    if (!base || !caixa.uazapi_token) {
      return json({ error: 'Caixa sem URL ou token UAZAPI configurados' }, 400);
    }

    // POST /webhook (modo simples): cria ou atualiza o único webhook da instância
    const resp = await fetch(`${base}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: caixa.uazapi_token },
      body: JSON.stringify({
        enabled: true,
        url: webhookUrl,
        events: ['messages', 'messages_update'],
        excludeMessages: ['wasSentByApi'],
      }),
    });

    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('[configurar-webhook-caixa] UAZAPI erro:', resp.status, data);
      return json({ error: `UAZAPI retornou ${resp.status}`, detalhe: data }, 502);
    }

    const config = Array.isArray(data) ? data[0] : data;
    console.log(`[configurar-webhook-caixa] Webhook configurado para caixa ${caixa.id} (${caixa.nome}) → ${webhookUrl}`);
    return json({ success: true, provedor, webhook_url: webhookUrl, enabled: config?.enabled ?? true });
  } catch (err) {
    console.error('[configurar-webhook-caixa] Erro:', err);
    return json({ error: err instanceof Error ? err.message : 'Erro interno' }, 500);
  }
});
