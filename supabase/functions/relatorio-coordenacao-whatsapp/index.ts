// Edge Function: relatorio-coordenacao-whatsapp
// Envia relatórios da Coordenação Pedagógica via WhatsApp para o grupo único
// Integração com UAZAPI

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const UAZAPI_URL = Deno.env.get('UAZAPI_BASE_URL') || 'https://lamusic.uazapi.com';
const UAZAPI_TOKEN = Deno.env.get('UAZAPI_TOKEN')!;

// Grupo único da Coordenação Pedagógica
const GRUPO_COORDENACAO = {
  jid: '120363304349910605@g.us',
  nome: 'COORDENAÇÃO PEDAGÓGICA'
};

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

/**
 * Envia mensagem via UAZAPI para o grupo da Coordenação
 */
async function enviarWhatsAppGrupo(
  mensagem: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!UAZAPI_TOKEN) {
    return { success: false, error: 'Token UAZAPI não configurado' };
  }

  let baseUrl = UAZAPI_URL;
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = 'https://' + baseUrl;
  }

  console.log(`[relatorio-coordenacao-whatsapp] Enviando para grupo: ${GRUPO_COORDENACAO.nome}`);

  try {
    const response = await fetch(`${baseUrl}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': UAZAPI_TOKEN,
      },
      body: JSON.stringify({
        number: GRUPO_COORDENACAO.jid,
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
        error: data.error || data.message || 'Erro ao enviar mensagem' 
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

    console.log(`[relatorio-coordenacao-whatsapp] Enviando relatório tipo: ${payload.tipoRelatorio}`);

    // Enviar para o grupo da Coordenação
    const resultado = await enviarWhatsAppGrupo(payload.texto);

    return new Response(
      JSON.stringify({
        success: resultado.success,
        grupo: GRUPO_COORDENACAO.nome,
        messageId: resultado.messageId,
        error: resultado.error,
      }),
      { 
        status: resultado.success ? 200 : 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[relatorio-coordenacao-whatsapp] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
