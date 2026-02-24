// Edge Function: relatorio-admin-whatsapp
// Envia relatórios administrativos via WhatsApp para grupos das Farmers
// Integração com UAZAPI

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
  unidade: string; // UUID da unidade ou 'todos' para consolidado
  competencia: string;
}

/**
 * Envia mensagem via UAZAPI para um grupo
 */
async function enviarWhatsAppGrupo(
  grupoJid: string,
  mensagem: string,
  creds: { baseUrl: string; token: string }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  console.log(`[relatorio-admin-whatsapp] Enviando para grupo: ${grupoJid}`);

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
      console.log(`[relatorio-admin-whatsapp] ✅ Mensagem enviada! ID: ${messageId}`);
      return { success: true, messageId };
    } else {
      console.error(`[relatorio-admin-whatsapp] ❌ Erro UAZAPI:`, data);
      return {
        success: false,
        error: (typeof data.error === 'string' ? data.error : null) || data.message || JSON.stringify(data)
      };
    }
  } catch (error) {
    console.error(`[relatorio-admin-whatsapp] ❌ Erro de conexão:`, error);
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const creds = await getUazapiCredentials(supabase, { funcao: 'sistema' });

    const payload: RelatorioPayload = await req.json();

    // Validar payload
    if (!payload.texto) {
      return new Response(
        JSON.stringify({ success: false, error: 'Texto do relatório não informado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar destinatários do banco
    let destQuery = supabase
      .from('whatsapp_destinatarios_relatorio')
      .select('jid, nome, unidade_id')
      .eq('tipo', 'relatorio_admin')
      .eq('ativo', true);

    if (payload.unidade && payload.unidade !== 'todos') {
      destQuery = destQuery.eq('unidade_id', payload.unidade);
    }

    const { data: gruposParaEnviar, error: destError } = await destQuery;

    if (destError) {
      console.error('[relatorio-admin-whatsapp] Erro ao buscar destinatários:', destError.message);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao buscar destinatários' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!gruposParaEnviar || gruposParaEnviar.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum destinatário configurado para este relatório' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[relatorio-admin-whatsapp] Enviando para ${gruposParaEnviar.length} grupo(s)`);

    // Enviar para cada grupo
    const resultados: { grupo: string; success: boolean; messageId?: string; error?: string }[] = [];
    
    for (const grupo of gruposParaEnviar) {
      const resultado = await enviarWhatsAppGrupo(grupo.jid, payload.texto, creds);
      resultados.push({
        grupo: grupo.nome,
        ...resultado
      });
      
      // Pequeno delay entre envios para evitar rate limit
      if (gruposParaEnviar.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Verificar se todos foram enviados com sucesso
    const todosEnviados = resultados.every(r => r.success);
    const algumEnviado = resultados.some(r => r.success);

    // Extrair erro dos resultados para exibir no frontend
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
    console.error('[relatorio-admin-whatsapp] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
