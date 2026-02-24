// Edge Function: professor-360-whatsapp
// Envia notificação via WhatsApp quando uma ocorrência 360° é registrada
// Integração com UAZAPI

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUazapiCredentials } from '../_shared/uazapi.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificacaoPayload {
  professorNome: string;
  professorWhatsApp: string;
  tipoOcorrencia: string;
  tipoCategoria?: 'penalidade' | 'bonus';
  dataOcorrencia: string;
  unidadeNome: string;
  registradoPor: string;
  descricao?: string | null;
  toleranciaInfo?: {
    ocorrencia_numero: number;
    tolerancia_total: number;
    tolerancia_esgotada: boolean;
    ultima_tolerancia: boolean;
    pontos_descontados: number;
  } | null;
  minutosAtraso?: number | null;
  atrasoGrave?: boolean;
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
 * Gera texto de tempo de atraso
 */
function getAtrasoTexto(minutosAtraso?: number | null): string {
  if (!minutosAtraso) return '';
  return `⏱️ *Tempo de atraso:* ${minutosAtraso >= 60 ? '1 hora ou mais' : `${minutosAtraso} minutos`}\n`;
}

/**
 * Gera texto de tolerância/atraso grave
 */
function getToleranciaTexto(dados: NotificacaoPayload): string {
  // Se atraso grave, mostrar mensagem específica
  if (dados.atrasoGrave) {
    return `\n❌ *Atraso acima de 10 minutos!* Pontuação descontada: -${dados.toleranciaInfo?.pontos_descontados || 0} pts (sem tolerância)\n`;
  }
  
  if (!dados.toleranciaInfo) return '';
  
  if (dados.toleranciaInfo.tolerancia_esgotada) {
    return `\n❌ *Tolerância esgotada!* Pontuação descontada: -${dados.toleranciaInfo.pontos_descontados} pts\n`;
  } else if (dados.toleranciaInfo.ultima_tolerancia) {
    return `\n⚠️ *Atenção:* Esta foi sua última tolerância (${dados.toleranciaInfo.ocorrencia_numero}/${dados.toleranciaInfo.tolerancia_total}). A próxima ocorrência descontará pontos.\n`;
  } else {
    return `\nℹ️ *Tolerância:* ${dados.toleranciaInfo.ocorrencia_numero}/${dados.toleranciaInfo.tolerancia_total} (ainda dentro da tolerância)\n`;
  }
}

/**
 * Monta a mensagem formatada para o WhatsApp
 */
function montarMensagem(dados: NotificacaoPayload): string {
  const primeiroNome = dados.professorNome.split(' ')[0];
  const dataFormatada = dados.dataOcorrencia.split('-').reverse().join('/');
  
  // Mensagem diferenciada para bônus
  if (dados.tipoCategoria === 'bonus') {
    let mensagem = `🎉 *LA Music - Reconhecimento 360°*\n\n`;
    mensagem += `Olá, ${primeiroNome}! 🌟\n\n`;
    mensagem += `*Parabéns!* Você acaba de ganhar pontos extras na sua avaliação!\n\n`;
    mensagem += `🏆 *Conquista:* ${dados.tipoOcorrencia}\n`;
    mensagem += `📅 *Data:* ${dataFormatada}\n`;
    mensagem += `🏢 *Unidade:* ${dados.unidadeNome}\n`;
    mensagem += `👤 *Registrado por:* ${dados.registradoPor}`;
    
    if (dados.descricao) {
      mensagem += `\n\n💬 *Mensagem:*\n${dados.descricao}`;
    }
    
    mensagem += `\n\nContinue assim! Seu engajamento faz a diferença na LA Music! 💪🎵`;
    mensagem += `\n\n---\nDúvidas? Fale com a coordenação.`;
    
    return mensagem;
  }
  
  // Mensagem padrão para penalidades
  let mensagem = `🔔 *LA Music - Avaliação 360°*\n\n`;
  mensagem += `Olá, ${primeiroNome}!\n\n`;
  mensagem += `Uma ocorrência foi registrada em seu perfil:\n\n`;
  mensagem += `📋 *Tipo:* ${dados.tipoOcorrencia}\n`;
  mensagem += getAtrasoTexto(dados.minutosAtraso);
  mensagem += `📅 *Data:* ${dataFormatada}\n`;
  mensagem += `🏢 *Unidade:* ${dados.unidadeNome}\n`;
  mensagem += `👤 *Registrado por:* ${dados.registradoPor}`;
  mensagem += getToleranciaTexto(dados);
  
  if (dados.descricao) {
    mensagem += `\n📝 *Observação:* ${dados.descricao}\n`;
  }
  
  mensagem += `\n---\nEm caso de dúvidas, procure a coordenação.`;
  
  return mensagem;
}

/**
 * Envia mensagem via UAZAPI
 */
async function enviarWhatsApp(
  telefone: string,
  mensagem: string,
  creds: { baseUrl: string; token: string }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const formattedPhone = formatPhoneNumber(telefone);

  console.log(`[professor-360-whatsapp] Enviando para: ${formattedPhone}`);

  try {
    const response = await fetch(`${creds.baseUrl}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': creds.token,
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
        error: (typeof data.error === 'string' ? data.error : null) || data.message || JSON.stringify(data)
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const creds = await getUazapiCredentials(supabase, { funcao: 'sistema' });

    // Montar e enviar mensagem
    const mensagem = montarMensagem(payload);
    const resultado = await enviarWhatsApp(payload.professorWhatsApp, mensagem, creds);

    return new Response(
      JSON.stringify(resultado),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[professor-360-whatsapp] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
