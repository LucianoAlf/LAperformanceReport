// Edge Function: deletar-mensagem-admin
// Deleta uma mensagem enviada via UAZAPI /message/delete (caixa administrativa)
// Marca a mensagem como deletada em admin_mensagens
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { mensagem_id } = await req.json();
    if (!mensagem_id) {
      return new Response(JSON.stringify({ error: 'mensagem_id obrigatorio' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: mensagem, error: msgError } = await supabase
      .from('admin_mensagens')
      .select('id, whatsapp_message_id, direcao, conversa_id')
      .eq('id', mensagem_id)
      .single();

    if (msgError || !mensagem) {
      return new Response(JSON.stringify({ error: 'Mensagem nao encontrada' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Marcar como deletada no banco
    await supabase.from('admin_mensagens').update({ deletada: true, conteudo: null }).eq('id', mensagem_id);

    if (!mensagem.whatsapp_message_id) {
      return new Response(JSON.stringify({ success: true, local_only: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: conversa } = await supabase
      .from('admin_conversas')
      .select('caixa_id, unidade_id')
      .eq('id', mensagem.conversa_id)
      .single();

    const creds = await getUazapiCredentials(supabase, {
      funcao: 'administrativo',
      caixaId: conversa?.caixa_id ?? undefined,
      unidadeId: conversa?.unidade_id ?? undefined,
    });

    console.log(`[deletar-mensagem-admin] Deletando ${mensagem.whatsapp_message_id} via ${creds.caixaNome}...`);

    const uazapiResp = await fetch(`${creds.baseUrl}/message/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: creds.token },
      body: JSON.stringify({ id: mensagem.whatsapp_message_id }),
    });

    const uazapiData = await uazapiResp.json().catch(() => ({}));
    console.log('[deletar-mensagem-admin] UAZAPI:', JSON.stringify(uazapiData).substring(0, 200));

    return new Response(JSON.stringify({ success: true, uazapi_ok: uazapiResp.ok && !uazapiData.error }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[deletar-mensagem-admin] Erro:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
