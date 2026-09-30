// Edge Function: professor-360-whatsapp
// Envia notificação via WhatsApp quando uma ocorrência 360° é registrada
// Enfileira para a Sol enviar pelo número dela (ver bloco "Envio pelo número da Sol")

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getWhatsAppCredentials, type WhatsAppCreds } from '../_shared/uazapi.ts';

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
 * Valida formato mínimo do número de telefone
 */
function validarTelefone(phone: string): { valido: boolean; motivo?: string } {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 10) {
    return { valido: false, motivo: `Número muito curto (${cleaned.length} dígitos, mín. 10)` };
  }
  if (cleaned.length > 15) {
    return { valido: false, motivo: `Número muito longo (${cleaned.length} dígitos, máx. 15)` };
  }
  return { valido: true };
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

// Envio pelo número da Sol (desde 30/09/2026).
// A Sol V2 fala pela ponte WhatsApp do Hermes na VPS la-hq, que só escuta em
// 127.0.0.1 — a edge não alcança. Então a edge ENFILEIRA em
// fila_relatorios_sol_hermes e o worker da Sol (cron de 1 min) envia por DM,
// sem fallback para outro número (metadata.rota = 'dm_sol').
// A caixa antiga "Sol" (WAHA) morreu em 27/07 com a migração, e era por ela
// que este envio saía — daí o erro "Session PAUSED_SOL_V2_… does not exist".
const CAIXA_CONSULTA_NUMERO = 3; // Lia (UAZAPI): usada só para CONSULTAR o número, nunca envia.

// Resolve o JID real do número no WhatsApp. Conta antiga do DDD 21 pode ter
// o JID sem o 9º dígito, e a ponte da Sol não corrige: mandar para o JID
// errado "sai" sem erro e não chega. Falha da consulta não bloqueia: segue
// com o número formatado e registra que não foi conferido.
async function resolverJid(
  telefone: string,
  creds: WhatsAppCreds | null
): Promise<{ jid: string | null; conferido: boolean; semWhatsApp: boolean; motivo?: string }> {
  const numero = formatPhoneNumber(telefone);
  const jidPadrao = `${numero}@s.whatsapp.net`;
  if (!creds || !creds.baseUrl || !creds.token) {
    return { jid: jidPadrao, conferido: false, semWhatsApp: false, motivo: 'sem_credencial_de_consulta' };
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(`${creds.baseUrl}/chat/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': creds.token },
      body: JSON.stringify({ numbers: [numero] }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await resp.json().catch(() => null);
    const r = Array.isArray(data) ? data[0] : null;
    if (!resp.ok || !r) {
      return { jid: jidPadrao, conferido: false, semWhatsApp: false, motivo: `consulta_http_${resp.status}` };
    }
    if (r.isInWhatsapp === false) {
      return { jid: null, conferido: true, semWhatsApp: true };
    }
    if (typeof r.jid === 'string' && r.jid.endsWith('@s.whatsapp.net')) {
      return { jid: r.jid, conferido: true, semWhatsApp: false };
    }
    return { jid: jidPadrao, conferido: false, semWhatsApp: false, motivo: 'consulta_sem_jid' };
  } catch (error) {
    return {
      jid: jidPadrao,
      conferido: false,
      semWhatsApp: false,
      motivo: `consulta_falhou: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 1. Parse do body
  let payload: NotificacaoPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Body inválido: esperado JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 2. Log resumido para debug
  console.log(`[professor-360-whatsapp] Recebido: professor=${payload.professorNome || '?'}, tipo=${payload.tipoOcorrencia || '?'}, categoria=${payload.tipoCategoria || 'penalidade'}, unidade=${payload.unidadeNome || '?'}`);

  // 3. Validar campos obrigatórios
  if (!payload.professorWhatsApp) {
    return new Response(
      JSON.stringify({ success: false, error: 'Número de WhatsApp do professor não informado' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!payload.professorNome || !payload.tipoOcorrencia) {
    const faltando = [];
    if (!payload.professorNome) faltando.push('professorNome');
    if (!payload.tipoOcorrencia) faltando.push('tipoOcorrencia');
    return new Response(
      JSON.stringify({ success: false, error: `Campos obrigatórios faltando: ${faltando.join(', ')}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 4. Validar formato do telefone
  const telefoneCheck = validarTelefone(payload.professorWhatsApp);
  if (!telefoneCheck.valido) {
    console.error(`[professor-360-whatsapp] Telefone inválido: ${payload.professorWhatsApp} - ${telefoneCheck.motivo}`);
    return new Response(
      JSON.stringify({ success: false, error: `Telefone inválido: ${telefoneCheck.motivo}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 5. Resolver o JID do professor e enfileirar para a Sol enviar
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const numeroFormatado = formatPhoneNumber(payload.professorWhatsApp);

  try {
    let credsConsulta: WhatsAppCreds | null = null;
    try {
      credsConsulta = await getWhatsAppCredentials(supabase, { caixaId: CAIXA_CONSULTA_NUMERO });
      if (credsConsulta.caixaId !== CAIXA_CONSULTA_NUMERO) credsConsulta = null;
    } catch (error) {
      console.error(`[professor-360-whatsapp] Caixa de consulta ${CAIXA_CONSULTA_NUMERO} indisponível:`, error);
    }

    const destino = await resolverJid(payload.professorWhatsApp, credsConsulta);
    if (destino.semWhatsApp) {
      console.error(`[professor-360-whatsapp] ${payload.professorNome}: número ${numeroFormatado} não tem WhatsApp`);
      return new Response(
        JSON.stringify({ success: false, error: `O número ${numeroFormatado} não tem WhatsApp. Confira o cadastro do professor.` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!destino.conferido) {
      console.warn(`[professor-360-whatsapp] ${payload.professorNome}: JID não conferido (${destino.motivo}), usando ${destino.jid}`);
    }

    const mensagem = montarMensagem(payload);
    const { data: fila, error: filaError } = await supabase
      .from('fila_relatorios_sol_hermes')
      .insert({
        tipo_relatorio: 'professor_360',
        origem: 'professor-360-whatsapp',
        unidade_nome: payload.unidadeNome || 'Sem unidade',
        jid: destino.jid,
        grupo_nome: `DM ${payload.professorNome}`,
        texto: mensagem,
        metadata: {
          rota: 'dm_sol',
          professor_nome: payload.professorNome,
          tipo_ocorrencia: payload.tipoOcorrencia,
          tipo_categoria: payload.tipoCategoria || 'penalidade',
          data_ocorrencia: payload.dataOcorrencia,
          registrado_por: payload.registradoPor,
          jid_conferido: destino.conferido,
          jid_motivo: destino.motivo ?? null,
        },
      })
      .select('id')
      .single();

    if (filaError || !fila) {
      const msg = filaError?.message || 'insert sem retorno';
      console.error(`[professor-360-whatsapp] Falha ao enfileirar para ${payload.professorNome} (${destino.jid}): ${msg}`);
      return new Response(
        JSON.stringify({ success: false, error: `Não consegui enfileirar a mensagem: ${msg}` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[professor-360-whatsapp] Enfileirado fila_id=${fila.id}: ${payload.professorNome} (${payload.tipoOcorrencia}) -> ${destino.jid}`);
    return new Response(
      JSON.stringify({ success: true, enfileirado: true, filaId: fila.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[professor-360-whatsapp] Erro inesperado para ${payload.professorNome} (${numeroFormatado}):`, errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: `Erro interno: ${errorMsg}` }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
