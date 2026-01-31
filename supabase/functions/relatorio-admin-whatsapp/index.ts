// Edge Function: relatorio-admin-whatsapp
// Envia relatórios administrativos via WhatsApp para grupos das Farmers
// Integração com UAZAPI

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const UAZAPI_URL = Deno.env.get('UAZAPI_BASE_URL') || 'https://lamusic.uazapi.com';
const UAZAPI_TOKEN = Deno.env.get('UAZAPI_TOKEN')!;

// Mapeamento de unidades para JIDs dos grupos
const GRUPOS_FARMERS: Record<string, { jid: string; nome: string }> = {
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': {
    jid: '5521965832009-1600979279@g.us',
    nome: 'RELATÓRIOS DIÁRIOS CG (Campo Grande)'
  },
  '368d47f5-2d88-4475-bc14-ba084a9a348e': {
    jid: '5521965832009-1625319907@g.us',
    nome: 'RELATÓRIOS DIÁRIOS BR (Barra)'
  },
  '95553e96-971b-4590-a6eb-0201d013c14d': {
    jid: '5521992426581-1581033423@g.us',
    nome: 'RELATÓRIOS DIÁRIOS RC (Recreio)'
  },
};

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
  mensagem: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!UAZAPI_TOKEN) {
    return { success: false, error: 'Token UAZAPI não configurado' };
  }

  let baseUrl = UAZAPI_URL;
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = 'https://' + baseUrl;
  }

  console.log(`[relatorio-admin-whatsapp] Enviando para grupo: ${grupoJid}`);

  try {
    const response = await fetch(`${baseUrl}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': UAZAPI_TOKEN,
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
        error: data.error || data.message || 'Erro ao enviar mensagem' 
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
    const payload: RelatorioPayload = await req.json();

    // Validar payload
    if (!payload.texto) {
      return new Response(
        JSON.stringify({ success: false, error: 'Texto do relatório não informado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determinar para quais grupos enviar
    const gruposParaEnviar: { jid: string; nome: string }[] = [];

    if (payload.unidade === 'todos' || !payload.unidade) {
      // Consolidado: enviar para todos os grupos
      Object.values(GRUPOS_FARMERS).forEach(grupo => {
        gruposParaEnviar.push(grupo);
      });
    } else if (GRUPOS_FARMERS[payload.unidade]) {
      // Unidade específica
      gruposParaEnviar.push(GRUPOS_FARMERS[payload.unidade]);
    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Unidade não encontrada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[relatorio-admin-whatsapp] Enviando para ${gruposParaEnviar.length} grupo(s)`);

    // Enviar para cada grupo
    const resultados: { grupo: string; success: boolean; messageId?: string; error?: string }[] = [];
    
    for (const grupo of gruposParaEnviar) {
      const resultado = await enviarWhatsAppGrupo(grupo.jid, payload.texto);
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

    return new Response(
      JSON.stringify({
        success: todosEnviados,
        partial: !todosEnviados && algumEnviado,
        resultados,
        messageId: resultados.find(r => r.success)?.messageId,
      }),
      { 
        status: todosEnviados ? 200 : (algumEnviado ? 207 : 500), 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[relatorio-admin-whatsapp] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
