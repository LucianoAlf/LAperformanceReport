// Edge Function: transcrever-audio
// Transcreve um áudio recebido via UAZAPI /message/download com transcribe=true
// Salva a transcrição no campo transcricao da crm_mensagens
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const UAZAPI_URL = Deno.env.get('UAZAPI_BASE_URL')!;
const UAZAPI_TOKEN = Deno.env.get('UAZAPI_TOKEN')!;

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
    const { mensagem_id } = await req.json();

    if (!mensagem_id) {
      return new Response(
        JSON.stringify({ error: 'mensagem_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Buscar mensagem
    const { data: mensagem, error: msgError } = await supabase
      .from('crm_mensagens')
      .select('id, whatsapp_message_id, tipo, transcricao')
      .eq('id', mensagem_id)
      .single();

    if (msgError || !mensagem) {
      return new Response(
        JSON.stringify({ error: 'Mensagem não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (mensagem.tipo !== 'audio') {
      return new Response(
        JSON.stringify({ error: 'Só é possível transcrever mensagens de áudio' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (mensagem.transcricao) {
      return new Response(
        JSON.stringify({ success: true, transcricao: mensagem.transcricao, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!mensagem.whatsapp_message_id) {
      return new Response(
        JSON.stringify({ error: 'Mensagem sem ID do WhatsApp' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Chamar UAZAPI /message/download com transcribe=true
    let baseUrl = UAZAPI_URL;
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = 'https://' + baseUrl;
    }

    console.log(`[transcrever-audio] Transcrevendo áudio ${mensagem.whatsapp_message_id}...`);

    const uazapiResponse = await fetch(`${baseUrl}/message/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': UAZAPI_TOKEN,
      },
      body: JSON.stringify({
        id: mensagem.whatsapp_message_id,
        transcribe: true,
        generate_mp3: true,
        return_link: true,
      }),
    });

    const uazapiData = await uazapiResponse.json();
    console.log('[transcrever-audio] Resposta UAZAPI:', JSON.stringify(uazapiData).substring(0, 500));

    if (uazapiResponse.ok && !uazapiData.error) {
      const transcricao = uazapiData.transcription || null;

      if (transcricao) {
        // 3. Salvar transcrição no banco
        await supabase
          .from('crm_mensagens')
          .update({ transcricao })
          .eq('id', mensagem_id);

        console.log(`[transcrever-audio] ✅ Transcrição salva: "${transcricao.substring(0, 100)}..."`);

        return new Response(
          JSON.stringify({ success: true, transcricao }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        return new Response(
          JSON.stringify({ success: false, error: 'UAZAPI não retornou transcrição. Verifique se a chave OpenAI está configurada na instância.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      const errorMsg = uazapiData.error || uazapiData.message || 'Erro ao transcrever via UAZAPI';
      console.error('[transcrever-audio] ❌ Erro UAZAPI:', errorMsg);

      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('[transcrever-audio] Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
