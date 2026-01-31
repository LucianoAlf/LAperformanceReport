// Edge Function: professor-360-whatsapp
// Envia notificação via WhatsApp quando uma ocorrência 360° é registrada
// Integração com UAZAPI

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const UAZAPI_URL = Deno.env.get('UAZAPI_BASE_URL') || 'https://lamusic.uazapi.com';
const UAZAPI_TOKEN = Deno.env.get('UAZAPI_TOKEN')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificacaoPayload {
  professorNome: string;
  professorWhatsApp: string;
  tipoOcorrencia: string;
  dataOcorrencia: string;
  unidadeNome: string;
  registradoPor: string;
  descricao?: string | null;
}

/**
 * Formata número de telefone para o padrão UAZAPI
 */
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

/**
 * Monta a mensagem formatada para o WhatsApp
 */
function montarMensagem(dados: NotificacaoPayload): string {
  const primeiroNome = dados.professorNome.split(' ')[0];
  const dataFormatada = dados.dataOcorrencia.split('-').reverse().join('/');
  
  let mensagem = `🔔 *LA Music - Avaliação 360°*\n\n`;
  mensagem += `Olá, ${primeiroNome}!\n\n`;
  mensagem += `Uma ocorrência foi registrada em seu perfil:\n\n`;
  mensagem += `📋 *Tipo:* ${dados.tipoOcorrencia}\n`;
  mensagem += `📅 *Data:* ${dataFormatada}\n`;
  mensagem += `🏢 *Unidade:* ${dados.unidadeNome}\n`;
  mensagem += `👤 *Registrado por:* ${dados.registradoPor}\n`;
  
  if (dados.descricao) {
    mensagem += `\n📝 *Observação:* ${dados.descricao}\n`;
  }
  
  mensagem += `\n---\nEm caso de dúvidas, procure a coordenação.`;
  
  return mensagem;
}

/**
 * Envia mensagem via UAZAPI
 */
async function enviarWhatsApp(telefone: string, mensagem: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!UAZAPI_TOKEN) {
    return { success: false, error: 'Token UAZAPI não configurado' };
  }

  const formattedPhone = formatPhoneNumber(telefone);
  
  // Garantir que a URL tem o protocolo https://
  let baseUrl = UAZAPI_URL;
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = 'https://' + baseUrl;
  }

  console.log(`[professor-360-whatsapp] Enviando para: ${formattedPhone}`);

  try {
    const response = await fetch(`${baseUrl}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': UAZAPI_TOKEN,
      },
      body: JSON.stringify({
        number: formattedPhone,
        text: mensagem,
        delay: 0,
        readchat: true,
      }),
    });

    const data = await response.json();

    if (response.ok && !data.error) {
      console.log(`[professor-360-whatsapp] ✅ Mensagem enviada! ID: ${data.id || data.messageid || data.key?.id}`);
      return { 
        success: true, 
        messageId: data.id || data.messageid || data.key?.id 
      };
    } else {
      console.error(`[professor-360-whatsapp] ❌ Erro UAZAPI:`, data);
      return { 
        success: false, 
        error: data.error || data.message || 'Erro ao enviar mensagem' 
      };
    }
  } catch (error) {
    console.error(`[professor-360-whatsapp] ❌ Erro de conexão:`, error);
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

  // Verificar Authorization header (aceita anon key ou service role)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ success: false, error: 'Authorization header required' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const payload: NotificacaoPayload = await req.json();

    // Validar payload
    if (!payload.professorWhatsApp) {
      return new Response(
        JSON.stringify({ success: false, error: 'Número de WhatsApp não informado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!payload.professorNome || !payload.tipoOcorrencia) {
      return new Response(
        JSON.stringify({ success: false, error: 'Dados incompletos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Montar e enviar mensagem
    const mensagem = montarMensagem(payload);
    const resultado = await enviarWhatsApp(payload.professorWhatsApp, mensagem);

    return new Response(
      JSON.stringify(resultado),
      { 
        status: resultado.success ? 200 : 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[professor-360-whatsapp] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
