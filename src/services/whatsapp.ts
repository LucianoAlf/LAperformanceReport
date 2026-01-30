// Serviço de integração com UAZAPI para envio de mensagens WhatsApp
// Documentação: https://docs.uazapi.com

export interface SendWhatsAppMessageParams {
  to: string; // número com DDI, ex: "5521999999999"
  text: string;
}

export interface WhatsAppResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface WhatsAppConnectionStatus {
  connected: boolean;
  phone?: string;
  error?: string;
}

const UAZAPI_BASE_URL = import.meta.env.VITE_UAZAPI_URL || 'https://lamusic.uazapi.com';
const UAZAPI_TOKEN = import.meta.env.VITE_UAZAPI_TOKEN;

/**
 * Envia uma mensagem de texto via WhatsApp usando UAZAPI
 */
export async function sendWhatsAppMessage(params: SendWhatsAppMessageParams): Promise<WhatsAppResponse> {
  if (!UAZAPI_TOKEN) {
    return { success: false, error: 'Token UAZAPI não configurado' };
  }

  try {
    const response = await fetch(`${UAZAPI_BASE_URL}/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': UAZAPI_TOKEN,
      },
      body: JSON.stringify({
        number: params.to,
        text: params.text,
        delay: 0,
        readchat: true,
      }),
    });

    const data = await response.json();

    if (response.ok && !data.error) {
      return { 
        success: true, 
        messageId: data.id || data.messageid || data.key?.id 
      };
    } else {
      return { 
        success: false, 
        error: data.error || data.message || 'Erro ao enviar mensagem' 
      };
    }
  } catch (error) {
    console.error('[WhatsApp] Erro ao enviar mensagem:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro de conexão' 
    };
  }
}

/**
 * Verifica o status de conexão da instância UAZAPI
 */
export async function getWhatsAppConnectionStatus(): Promise<WhatsAppConnectionStatus> {
  if (!UAZAPI_TOKEN) {
    return { connected: false, error: 'Token UAZAPI não configurado' };
  }

  try {
    const response = await fetch(`${UAZAPI_BASE_URL}/status`, {
      method: 'GET',
      headers: {
        'token': UAZAPI_TOKEN,
      },
    });

    const data = await response.json();

    if (response.ok) {
      return { 
        connected: data.status === 'connected' || data.connected === true,
        phone: data.phone || data.number || data.wid?.user,
      };
    } else {
      return { 
        connected: false, 
        error: data.error || 'Erro ao verificar status' 
      };
    }
  } catch (error) {
    console.error('[WhatsApp] Erro ao verificar status:', error);
    return { 
      connected: false, 
      error: error instanceof Error ? error.message : 'Erro de conexão' 
    };
  }
}

/**
 * Formata número de telefone para o padrão UAZAPI (apenas números com DDI)
 * Entrada: "(21) 98978-4688" ou "21989784688" ou "+5521989784688"
 * Saída: "5521989784688"
 */
export function formatPhoneNumber(phone: string): string {
  // Remove tudo que não é número
  let cleaned = phone.replace(/\D/g, '');
  
  // Se começar com 0, remove
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  // Se não começar com 55 (Brasil), adiciona
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }
  
  return cleaned;
}

/**
 * Envia mensagem de teste para verificar integração
 */
export async function sendTestMessage(phoneNumber: string): Promise<WhatsAppResponse> {
  const formattedNumber = formatPhoneNumber(phoneNumber);
  
  return sendWhatsAppMessage({
    to: formattedNumber,
    text: '✅ Teste de integração LA Music Report - WhatsApp conectado com sucesso!',
  });
}
