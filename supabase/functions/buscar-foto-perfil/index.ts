// Edge Function: buscar-foto-perfil
// Busca foto de perfil do WhatsApp via UAZAPI e cacheia em crm_conversas.foto_perfil_url
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
    const { conversa_id, whatsapp_jid } = await req.json();

    if (!conversa_id || !whatsapp_jid) {
      return new Response(
        JSON.stringify({ error: 'conversa_id e whatsapp_jid são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Buscar conversa para resolver credenciais UAZAPI
    const { data: conversa } = await supabase
      .from('crm_conversas')
      .select('caixa_id, unidade_id')
      .eq('id', conversa_id)
      .single();

    const creds = await getUazapiCredentials(supabase, { funcao: 'agente', caixaId: conversa?.caixa_id ?? undefined, unidadeId: conversa?.unidade_id ?? undefined });

    // Buscar foto de perfil via UAZAPI
    const numero = whatsapp_jid.replace('@s.whatsapp.net', '');
    const response = await fetch(`${creds.baseUrl}/misc/getProfilePicUrl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': creds.token,
      },
      body: JSON.stringify({ number: numero }),
    });

    const data = await response.json();
    console.log(`[buscar-foto-perfil] Resposta UAZAPI (caixa: ${creds.caixaNome}):`, JSON.stringify(data).substring(0, 200));

    const fotoUrl = data?.profilePictureUrl || data?.url || data?.imgUrl || data?.profilePicUrl || null;

    if (fotoUrl) {
      // Cachear no banco
      await supabase
        .from('crm_conversas')
        .update({ foto_perfil_url: fotoUrl })
        .eq('id', conversa_id);

      console.log(`[buscar-foto-perfil] ✅ Foto cacheada para conversa ${conversa_id}`);
    }

    return new Response(
      JSON.stringify({ success: true, foto_perfil_url: fotoUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[buscar-foto-perfil] Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
