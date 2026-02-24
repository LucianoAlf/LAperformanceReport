// Edge Function: relatorio-coordenacao-whatsapp
// Envia relatórios da Coordenação Pedagógica via WhatsApp
// Destinatários configurados na tabela whatsapp_destinatarios_relatorio
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUazapiCredentials } from '../_shared/uazapi.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RelatorioPayload {
  texto: string;
  tipoRelatorio: string;
  unidadeNome?: string;
  competencia?: string;
}

async function enviarWhatsAppGrupo(
  grupoJid: string,
  mensagem: string,
  creds: { baseUrl: string; token: string }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  console.log(`[relatorio-coordenacao-whatsapp] Enviando para: ${grupoJid}`);

  try {
    const response = await fetch(`${creds.baseUrl}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': creds.token,
      },
      body: JSON.stringify({
        number: grupoJid,
        text: mensagem,
        delay: 0,
        readchat: true,
      }),
    });

    const data = await response.json();

    if (response.ok && !data.error) {
      const messageId = data.id || data.messageid || data.key?.id;
      console.log(`[relatorio-coordenacao-whatsapp] ✅ Mensagem enviada! ID: ${messageId}`);
      return { success: true, messageId };
    } else {
      console.error(`[relatorio-coordenacao-whatsapp] ❌ Erro UAZAPI:`, data);
      return {
        success: false,
        error: (typeof data.error === 'string' ? data.error : null) || data.message || JSON.stringify(data)
      };
    }
  } catch (error) {
    console.error(`[relatorio-coordenacao-whatsapp] ❌ Erro de conexão:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro de conexão'
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: RelatorioPayload = await req.json();

    // Validar payload
    if (!payload.texto) {
      return new Response(
        JSON.stringify({ success: false, error: 'Texto do relatório não informado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const creds = await getUazapiCredentials(supabase, { funcao: 'sistema' });

    // Buscar destinatários do banco
    const { data: destinatarios, error: destError } = await supabase
      .from('whatsapp_destinatarios_relatorio')
      .select('jid, nome')
      .eq('tipo', 'relatorio_coordenacao')
      .eq('ativo', true);

    if (destError) {
      console.error('[relatorio-coordenacao-whatsapp] Erro ao buscar destinatários:', destError.message);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao buscar destinatários' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!destinatarios || destinatarios.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum destinatário configurado para relatório coordenação' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[relatorio-coordenacao-whatsapp] Enviando para ${destinatarios.length} grupo(s), tipo: ${payload.tipoRelatorio}`);

    // Enviar para cada destinatário
    const resultados: { grupo: string; success: boolean; messageId?: string; error?: string }[] = [];

    for (const dest of destinatarios) {
      const resultado = await enviarWhatsAppGrupo(dest.jid, payload.texto, creds);
      resultados.push({ grupo: dest.nome, ...resultado });

      if (destinatarios.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const todosEnviados = resultados.every(r => r.success);
    const algumEnviado = resultados.some(r => r.success);
    const erroMsg = !todosEnviados
      ? resultados.filter(r => !r.success).map(r => r.error).join('; ')
      : undefined;

    return new Response(
      JSON.stringify({
        success: todosEnviados,
        partial: !todosEnviados && algumEnviado,
        error: erroMsg,
        resultados,
        messageId: resultados.find(r => r.success)?.messageId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[relatorio-coordenacao-whatsapp] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
