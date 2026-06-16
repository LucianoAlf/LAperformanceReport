// Edge Function: enviar-boas-vindas-matricula
// Substitui o workflow n8n [ Sucesso do Aluno ] - Nova Matricula.
// Envia boas-vindas + notificacao pela caixa UAZAPI "Sol - Sucesso do Aluno" (id=3)
// e registra cada envio em admin_conversas/admin_mensagens (departamento sucesso_aluno),
// para aparecer na Caixa de Entrada do modulo Sucesso do Aluno.
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// ===== MODO TESTE =====
// Enquanto MODO_TESTE = true:
//  - a boas-vindas NAO vai para o telefone real do responsavel, vai para NUMERO_TESTE;
//  - a notificacao da Fabi tambem e redirecionada para NUMERO_TESTE (a Fabi nao recebe nada).
// Trocar para false quando for liberar em producao.
const MODO_TESTE = true;
const NUMERO_TESTE = '5521966583325'; // mesmo chatId de teste do workflow n8n
const NUMERO_FABI = '5521994696489';

// Caixa "Sol - Sucesso do Aluno"
const CAIXA_SUCESSO_ID = 3;
const DEPARTAMENTO = 'sucesso_aluno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function formatPhoneNumber(phone) {
  let c = String(phone || '').replace(/\D/g, '');
  if (c.startsWith('0')) c = c.substring(1);
  if (c && !c.startsWith('55')) c = '55' + c;
  return c;
}

function primeiroNome(nome) {
  return String(nome || '').trim().split(' ')[0] || '';
}

// Mapeia o nome da unidade (texto do payload) para o unidade_id (mesma logica do n8n).
function mapearUnidadeId(unidade) {
  const u = String(unidade || '').toLowerCase();
  if (u.includes('campo')) return '2ec861f6-023f-4d7b-9927-3960ad8c2a92'; // Campo Grande
  if (u.includes('recreio')) return '95553e96-971b-4590-a6eb-0201d013c14d'; // Recreio
  if (u.includes('barra')) return '368d47f5-2d88-4475-bc14-ba084a9a348e'; // Barra
  return null;
}

async function enviarUazapi(baseUrl, token, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const endpoint = body.file ? '/send/media' : '/send/text';
    const resp = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await resp.json().catch(() => ({}));
    const messageId = data.id || data.messageid || data.key?.id || null;
    return { ok: resp.ok && !data.error, data, messageId };
  } catch (e) {
    return { ok: false, data: { error: e instanceof Error ? e.message : String(e) }, messageId: null };
  } finally {
    clearTimeout(timeout);
  }
}

// Registra a mensagem enviada na Caixa de Entrada (admin_conversas/admin_mensagens).
// Se achar aluno pelo telefone, vincula a conversa ao aluno; senao cria conversa externa.
async function registrarNaCaixa(supabase, { numero, tipo, conteudo, midiaUrl, midiaMimetype, whatsappMessageId, status, nomeContatoFallback, remetenteNome, unidadeIdFallback = null }) {
  try {
    const phoneSuffix = numero.slice(-11);
    const { data: aluno } = await supabase
      .from('alunos')
      .select('id, nome, unidade_id')
      .or(`telefone.like.%${phoneSuffix},whatsapp.like.%${phoneSuffix}`)
      .limit(1)
      .maybeSingle();

    let conversaId = null;
    let alunoIdMsg = null;

    if (aluno) {
      alunoIdMsg = aluno.id;
      const { data: conv } = await supabase
        .from('admin_conversas')
        .select('id')
        .eq('aluno_id', aluno.id)
        .eq('unidade_id', aluno.unidade_id)
        .eq('departamento', DEPARTAMENTO)
        .maybeSingle();
      if (conv) {
        conversaId = conv.id;
      } else {
        const { data: nova } = await supabase
          .from('admin_conversas')
          .insert({ aluno_id: aluno.id, unidade_id: aluno.unidade_id, departamento: DEPARTAMENTO, caixa_id: CAIXA_SUCESSO_ID, whatsapp_jid: numero, status: 'aberta' })
          .select('id')
          .single();
        conversaId = nova?.id || null;
      }
    } else {
      const { data: conv } = await supabase
        .from('admin_conversas')
        .select('id, unidade_id')
        .eq('telefone_externo', numero)
        .eq('departamento', DEPARTAMENTO)
        .is('aluno_id', null)
        .maybeSingle();
      if (conv) {
        conversaId = conv.id;
        // Preenche a unidade se a conversa externa ainda nao tiver e o payload trouxe.
        if (!conv.unidade_id && unidadeIdFallback) {
          await supabase.from('admin_conversas').update({ unidade_id: unidadeIdFallback }).eq('id', conv.id);
        }
      } else {
        const { data: nova } = await supabase
          .from('admin_conversas')
          .insert({ aluno_id: null, telefone_externo: numero, nome_externo: nomeContatoFallback || numero, unidade_id: unidadeIdFallback, departamento: DEPARTAMENTO, caixa_id: CAIXA_SUCESSO_ID, whatsapp_jid: numero, status: 'aberta' })
          .select('id')
          .single();
        conversaId = nova?.id || null;
      }
    }

    if (!conversaId) { console.error('[boas-vindas] registro: sem conversa para', numero); return; }

    await supabase.from('admin_mensagens').insert({
      conversa_id: conversaId,
      aluno_id: alunoIdMsg,
      direcao: 'saida',
      tipo,
      conteudo: conteudo || null,
      midia_url: midiaUrl || null,
      midia_mimetype: midiaMimetype || null,
      remetente: 'admin',
      remetente_nome: remetenteNome || 'Sucesso do Aluno',
      status_entrega: status,
      whatsapp_message_id: whatsappMessageId || null,
    });

    const preview = (conteudo || `[${tipo}]`).substring(0, 100);
    await supabase.from('admin_conversas')
      .update({ ultima_mensagem_at: new Date().toISOString(), ultima_mensagem_preview: preview, whatsapp_jid: numero, updated_at: new Date().toISOString() })
      .eq('id', conversaId);
  } catch (e) {
    console.error('[boas-vindas] erro ao registrar na caixa:', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    if (body.ping) {
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const {
      telefone_responsavel,
      nome_responsavel = '',
      nome_aluno = '',
      nome_professor = '',
      nome_curso = '',
      unidade = '',
      tipo = 'matricula',
    } = body;

    if (!telefone_responsavel) {
      return new Response(JSON.stringify({ error: 'telefone_responsavel e obrigatorio' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Credenciais da caixa Sol - Sucesso do Aluno
    const { data: caixa, error: caixaError } = await supabase
      .from('whatsapp_caixas')
      .select('id, nome, uazapi_url, uazapi_token')
      .eq('id', CAIXA_SUCESSO_ID)
      .eq('ativo', true)
      .maybeSingle();
    if (caixaError || !caixa) {
      return new Response(JSON.stringify({ error: 'Caixa Sucesso do Aluno nao encontrada/ativa' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    let baseUrl = caixa.uazapi_url || '';
    if (baseUrl && !baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
    baseUrl = baseUrl.replace(/\/+$/, '');
    const token = caixa.uazapi_token;

    // Numeros de destino (modo teste sobrescreve ambos para NUMERO_TESTE)
    const numeroReal = formatPhoneNumber(telefone_responsavel);
    const numeroDestino = MODO_TESTE ? NUMERO_TESTE : numeroReal;
    const numeroFabiDestino = MODO_TESTE ? NUMERO_TESTE : NUMERO_FABI;
    const unidadeIdPayload = mapearUnidadeId(unidade);

    // Busca video do professor (mesma regra do n8n)
    const { data: videoUrl } = await supabase.rpc('buscar_video_professor', {
      p_nome_professor: nome_professor,
      p_nome_curso: nome_curso,
      p_tipo: tipo,
    });

    const nome1 = primeiroNome(nome_responsavel.trim() ? nome_responsavel : nome_aluno);
    const prof1 = primeiroNome(nome_professor);
    const avisoTeste = MODO_TESTE ? '🧪 *MENSAGEM DE TESTE — desconsidere* 🧪\n\n' : '';

    // Monta mensagem de boas-vindas
    let msgBody;
    let conteudoBoasVindas;
    let tipoBoasVindas;
    if (videoUrl) {
      conteudoBoasVindas = `${avisoTeste}🎵 Olá, ${nome1}! Seja bem-vindo(a) à família LA Music! 🎶\nA matrícula de *${nome_aluno}* no curso de *${nome_curso}* está confirmada!\n\n${prof1} preparou esse vídeo especialmente para vocês 🚀`;
      tipoBoasVindas = 'video';
      msgBody = { number: numeroDestino, type: 'video', file: videoUrl, text: conteudoBoasVindas, delay: 500, readchat: true };
    } else {
      conteudoBoasVindas = `${avisoTeste}🎵 Olá, ${nome1}! Seja bem-vindo(a) à família LA Music! 🎶\nA matrícula de *${nome_aluno}* no curso de *${nome_curso}* está confirmada — estamos animados pra começar essa jornada musical com vocês!`;
      tipoBoasVindas = 'texto';
      msgBody = { number: numeroDestino, text: conteudoBoasVindas, linkPreview: true, delay: 500, readchat: true };
    }

    // Envia boas-vindas + registra na caixa
    const resultBoasVindas = await enviarUazapi(baseUrl, token, msgBody);
    console.log(`[boas-vindas] destino=${numeroDestino} video=${videoUrl ? 'sim' : 'nao'} ok=${resultBoasVindas.ok} teste=${MODO_TESTE}`, resultBoasVindas.data?.error || '');
    await registrarNaCaixa(supabase, {
      numero: numeroDestino,
      tipo: tipoBoasVindas,
      conteudo: conteudoBoasVindas,
      midiaUrl: videoUrl || null,
      midiaMimetype: videoUrl ? 'video/mp4' : null,
      whatsappMessageId: resultBoasVindas.messageId,
      status: resultBoasVindas.ok ? 'enviada' : 'erro',
      nomeContatoFallback: nome_responsavel || nome_aluno,
      remetenteNome: 'Boas-vindas (automático)',
      unidadeIdFallback: unidadeIdPayload,
    });

    // Notifica Fabi (em modo teste vai para NUMERO_TESTE) + registra na caixa
    const cabecalhoFabi = MODO_TESTE
      ? '🧪 *TESTE — NÃO É UMA MATRÍCULA REAL* 🧪\n_Preview da notificação que a Fabi receberia em produção._\n\n'
      : '';
    const textoFabi = `${cabecalhoFabi}🎓 *Nova matrícula!*\n\n*Aluno:* ${nome_aluno}\n*Responsável:* ${nome_responsavel}\n*Telefone:* ${telefone_responsavel}\n*Curso:* ${nome_curso}\n*Professor:* ${nome_professor}\n*Unidade:* ${unidade}`;
    const resultFabi = await enviarUazapi(baseUrl, token, { number: numeroFabiDestino, text: textoFabi, delay: 500, readchat: true });
    console.log(`[boas-vindas] notificar-fabi destino=${numeroFabiDestino} ok=${resultFabi.ok}`, resultFabi.data?.error || '');
    await registrarNaCaixa(supabase, {
      numero: numeroFabiDestino,
      tipo: 'texto',
      conteudo: textoFabi,
      whatsappMessageId: resultFabi.messageId,
      status: resultFabi.ok ? 'enviada' : 'erro',
      nomeContatoFallback: MODO_TESTE ? 'Teste (Fabi)' : 'Fabi',
      remetenteNome: 'Notificação (automático)',
    });

    return new Response(JSON.stringify({
      success: true,
      modo_teste: MODO_TESTE,
      destino_boas_vindas: numeroDestino,
      destino_notificacao: numeroFabiDestino,
      enviou_video: !!videoUrl,
      boas_vindas_ok: resultBoasVindas.ok,
      boas_vindas_erro: resultBoasVindas.ok ? null : resultBoasVindas.data?.error,
      fabi_ok: resultFabi.ok,
      fabi_erro: resultFabi.ok ? null : resultFabi.data?.error,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[boas-vindas] erro:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
