// Edge Function: criar-sessao-feedback
// Cria/reutiliza uma sessão pública de feedback do professor e, opcionalmente,
// envia o link por WhatsApp.
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getWhatsAppCredentials, toWahaJid, type WhatsAppCreds } from '../_shared/uazapi.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizarTelefone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
  if (!cleaned.startsWith('55')) cleaned = `55${cleaned}`;
  return cleaned;
}

function primeiroNome(nome: string): string {
  return (nome || '').trim().split(/\s+/)[0] || 'professor';
}

function montarMensagem(params: { professorNome: string; linkFeedback: string; lembrete: boolean }): string {
  const chamada = params.lembrete ? 'Lembrete: precisamos' : 'Precisamos';
  return [
    `Olá, ${primeiroNome(params.professorNome)}! 🎵`,
    '',
    `${chamada} do seu feedback sobre seus alunos.`,
    '',
    `Acesse: ${params.linkFeedback}`,
    '',
    'O link expira em 7 dias.',
    '',
    'Obrigado! 💜',
  ].join('\n');
}

async function enviarWhatsApp(
  numero: string,
  mensagem: string,
  creds: WhatsAppCreds,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    let response: Response;

    if (creds.provedor === 'waha') {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (creds.wahaApiKey) headers['X-Api-Key'] = creds.wahaApiKey;
      response = await fetch(`${creds.wahaUrl}/api/sendText`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          session: creds.wahaSession,
          chatId: toWahaJid(numero),
          text: mensagem,
        }),
      });
    } else {
      response = await fetch(`${creds.baseUrl}/send/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: creds.token },
        body: JSON.stringify({
          number: numero,
          text: mensagem,
          delay: 0,
          readchat: true,
          linkPreview: true,
        }),
      });
    }

    const data = await response.json().catch(() => ({}));
    if (response.ok && !data.error) {
      return { success: true, messageId: data.id || data.messageid || data.key?.id };
    }

    return {
      success: false,
      error: data.error || data.message || `WhatsApp retornou HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro de conexão com WhatsApp',
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const {
      professor_id,
      unidade_id,
      competencia,
      enviar_whatsapp = false,
      numero_teste,
      base_url,
    } = await req.json();

    if (!professor_id || !unidade_id || !competencia) {
      return json({ success: false, error: 'professor_id, unidade_id e competencia são obrigatórios' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: professor, error: professorError } = await supabase
      .from('professores')
      .select('id, nome, telefone_whatsapp')
      .eq('id', professor_id)
      .maybeSingle();

    if (professorError || !professor) {
      return json({ success: false, error: 'Professor não encontrado' }, 404);
    }

    const { count: totalAlunos, error: alunosError } = await supabase
      .from('alunos')
      .select('id', { count: 'exact', head: true })
      .eq('professor_atual_id', professor_id)
      .eq('unidade_id', unidade_id)
      .eq('status', 'ativo');

    if (alunosError) {
      return json({ success: false, error: `Erro ao contar alunos: ${alunosError.message}` }, 500);
    }

    const now = new Date().toISOString();
    const { data: sessaoExistente, error: sessaoBuscaError } = await supabase
      .from('aluno_feedback_sessoes')
      .select('id, token, status, total_alunos, respondidos, enviado_em')
      .eq('professor_id', professor_id)
      .eq('unidade_id', unidade_id)
      .eq('competencia', competencia)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessaoBuscaError) {
      return json({ success: false, error: `Erro ao buscar sessão: ${sessaoBuscaError.message}` }, 500);
    }

    let sessao = sessaoExistente;
    const total = totalAlunos || 0;

    if (sessao) {
      const { data: atualizada, error: updateError } = await supabase
        .from('aluno_feedback_sessoes')
        .update({
          total_alunos: total,
          enviado_em: now,
        })
        .eq('id', sessao.id)
        .select('id, token, status, total_alunos, respondidos, enviado_em')
        .single();

      if (updateError) {
        return json({ success: false, error: `Erro ao atualizar sessão: ${updateError.message}` }, 500);
      }
      sessao = atualizada;
    } else {
      const { data: criada, error: insertError } = await supabase
        .from('aluno_feedback_sessoes')
        .insert({
          professor_id,
          unidade_id,
          competencia,
          token: crypto.randomUUID(),
          status: 'pendente',
          total_alunos: total,
          respondidos: 0,
          enviado_em: now,
        })
        .select('id, token, status, total_alunos, respondidos, enviado_em')
        .single();

      if (insertError) {
        return json({ success: false, error: `Erro ao criar sessão: ${insertError.message}` }, 500);
      }
      sessao = criada;
    }

    const siteUrl = (base_url || Deno.env.get('SITE_URL') || 'https://lareport.vercel.app').replace(/\/+$/, '');
    const linkFeedback = `${siteUrl}/feedback/${sessao.token}`;
    let whatsapp: { success: boolean; messageId?: string; error?: string } | null = null;

    if (enviar_whatsapp) {
      const numero = normalizarTelefone(numero_teste) || normalizarTelefone(professor.telefone_whatsapp);
      if (!numero) {
        whatsapp = { success: false, error: 'Professor sem WhatsApp cadastrado' };
      } else {
        try {
          let creds: WhatsAppCreds;
          try {
            creds = await getWhatsAppCredentials(supabase, { funcao: 'administrativo', unidadeId: unidade_id });
          } catch {
            creds = await getWhatsAppCredentials(supabase, { funcao: 'sistema', unidadeId: unidade_id });
          }
          whatsapp = await enviarWhatsApp(
            numero,
            montarMensagem({
              professorNome: professor.nome,
              linkFeedback,
              lembrete: Boolean(sessaoExistente),
            }),
            creds,
          );
        } catch (whatsappError) {
          whatsapp = {
            success: false,
            error: whatsappError instanceof Error ? whatsappError.message : 'Erro ao enviar WhatsApp',
          };
        }
      }
    }

    return json({
      success: true,
      sessao: {
        id: sessao.id,
        token: sessao.token,
        link: linkFeedback,
        status: sessao.status,
        enviado_em: sessao.enviado_em,
        total_alunos: sessao.total_alunos,
        respondidos: sessao.respondidos,
      },
      whatsapp,
    });
  } catch (error) {
    console.error('[criar-sessao-feedback] Erro:', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro interno',
    }, 500);
  }
});
