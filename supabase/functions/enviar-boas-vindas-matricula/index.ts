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
//  - a notificacao da equipe tambem e redirecionada para NUMERO_TESTE.
// Trocar para false quando for liberar em producao.
const MODO_TESTE = false;
const NUMERO_TESTE = '5521966583325'; // mesmo chatId de teste do workflow n8n
// Equipe que recebe a notificacao de nova matricula (em modo teste, todos viram NUMERO_TESTE).
// A Fabi saiu daqui (2026-07-06): ela agora recebe o resumo diario de 1a aula pela
// edge notificar-primeira-aula-fabi (cron), a pedido dela. Matricula fica so com a Jessyca.
const NOTIFICAR_EQUIPE = [
  { nome: 'Jessyca', numero: '5521984695110' },
];

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

function normalizarChave(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
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
async function registrarNaCaixa(supabase, { numero, tipo, conteudo, midiaUrl, midiaMimetype, whatsappMessageId, status, nomeContatoFallback, remetenteNome }) {
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
      // unidade_id = null: a caixa e consolidada e o webhook-whatsapp-inbox so casa
      // conversa externa com unidade_id NULL. Setar unidade aqui faria o webhook nao
      // reconhecer a conversa e DUPLICAR quando o contato respondesse.
      const { data: conv } = await supabase
        .from('admin_conversas')
        .select('id')
        .eq('telefone_externo', numero)
        .eq('departamento', DEPARTAMENTO)
        .is('aluno_id', null)
        .maybeSingle();
      if (conv) {
        conversaId = conv.id;
      } else {
        const { data: nova } = await supabase
          .from('admin_conversas')
          .insert({ aluno_id: null, telefone_externo: numero, nome_externo: nomeContatoFallback || numero, unidade_id: null, departamento: DEPARTAMENTO, caixa_id: CAIXA_SUCESSO_ID, whatsapp_jid: numero, status: 'aberta' })
          .select('id')
          .single();
        conversaId = nova?.id || null;
      }
    }

    if (!conversaId) { console.error('[boas-vindas] registro: sem conversa para', numero); return; }

    const registro = {
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
    };
    // Upsert por whatsapp_message_id (esta função é a FONTE DE VERDADE do envio):
    // o webhook-whatsapp-inbox escuta o eco fromMe da MESMA mensagem e pode registrá-la
    // primeiro como 'sistema'/texto (perdendo o vídeo). O eco usa o mesmo whatsapp_message_id,
    // então sobrescrevemos com os dados corretos (tipo=video, remetente=admin, mídia).
    // Sem id (envio falhou) não há conflito possível → insert simples.
    if (whatsappMessageId) {
      await supabase.from('admin_mensagens').upsert(registro, { onConflict: 'whatsapp_message_id' });
    } else {
      await supabase.from('admin_mensagens').insert(registro);
    }

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

    // ===== IDEMPOTENCIA: reserva ANTES de enviar =====
    // Garante que cada matricula receba a boas-vindas UMA unica vez.
    // Chave: id_externo (ex: emusys_matricula_id) se vier; senao telefone+aluno+curso+tipo.
    // body.forcar=true pula a checagem (uso em testes).
    const telefoneChave = formatPhoneNumber(telefone_responsavel);
    const chaveIdempotencia = body.id_externo
      ? `ext:${normalizarChave(body.id_externo)}`
      : `bv:${telefoneChave}|${normalizarChave(nome_aluno)}|${normalizarChave(nome_curso)}|${normalizarChave(tipo)}`;

    if (!body.forcar) {
      const { error: reservaError } = await supabase
        .from('boas_vindas_enviadas')
        .insert({ chave_idempotencia: chaveIdempotencia, telefone: telefoneChave, nome_aluno, nome_curso, tipo, unidade });
      if (reservaError) {
        if (reservaError.code === '23505') {
          console.log(`[boas-vindas] DUPLICATA bloqueada: ${chaveIdempotencia}`);
          return new Response(JSON.stringify({ success: true, ignorado: true, motivo: 'boas_vindas_ja_enviada', chave: chaveIdempotencia }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        // Erro diferente de conflito: aborta para nao arriscar envio sem registro de controle.
        console.error('[boas-vindas] erro ao reservar idempotencia:', reservaError);
        return new Response(JSON.stringify({ error: 'Falha ao reservar idempotencia: ' + reservaError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

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

    // Numeros de destino (modo teste sobrescreve para NUMERO_TESTE)
    const numeroReal = formatPhoneNumber(telefone_responsavel);
    const numeroDestino = MODO_TESTE ? NUMERO_TESTE : numeroReal;

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
    });

    // Idempotencia: se a boas-vindas falhou, libera a reserva para permitir nova tentativa.
    // Se enviou ok, marca como enviada (a chave permanece e bloqueia reenvio).
    if (!body.forcar) {
      if (resultBoasVindas.ok) {
        await supabase.from('boas_vindas_enviadas').update({ enviado_ok: true }).eq('chave_idempotencia', chaveIdempotencia);
      } else {
        await supabase.from('boas_vindas_enviadas').delete().eq('chave_idempotencia', chaveIdempotencia);
        console.log(`[boas-vindas] reserva liberada (envio falhou): ${chaveIdempotencia}`);
      }
    }

    // Notifica a equipe (Jessyca). Em modo teste, todos viram NUMERO_TESTE.
    const cabecalhoNotif = MODO_TESTE
      ? '🧪 *TESTE — NÃO É UMA MATRÍCULA REAL* 🧪\n_Preview da notificação que a equipe receberia em produção._\n\n'
      : '';
    const textoNotif = `${cabecalhoNotif}🎓 *Nova matrícula!*\n\n*Aluno:* ${nome_aluno}\n*Responsável:* ${nome_responsavel}\n*Telefone:* ${telefone_responsavel}\n*Curso:* ${nome_curso}\n*Professor:* ${nome_professor}\n*Unidade:* ${unidade}`;

    const notificacoes = [];
    for (const membro of NOTIFICAR_EQUIPE) {
      const destino = MODO_TESTE ? NUMERO_TESTE : membro.numero;
      const result = await enviarUazapi(baseUrl, token, { number: destino, text: textoNotif, delay: 500, readchat: true });
      console.log(`[boas-vindas] notificar-${membro.nome} destino=${destino} ok=${result.ok}`, result.data?.error || '');
      await registrarNaCaixa(supabase, {
        numero: destino,
        tipo: 'texto',
        conteudo: textoNotif,
        whatsappMessageId: result.messageId,
        status: result.ok ? 'enviada' : 'erro',
        nomeContatoFallback: MODO_TESTE ? `Teste (${membro.nome})` : membro.nome,
        remetenteNome: 'Notificação (automático)',
      });
      notificacoes.push({ nome: membro.nome, destino, ok: result.ok, erro: result.ok ? null : result.data?.error });
    }

    return new Response(JSON.stringify({
      success: true,
      modo_teste: MODO_TESTE,
      destino_boas_vindas: numeroDestino,
      enviou_video: !!videoUrl,
      boas_vindas_ok: resultBoasVindas.ok,
      boas_vindas_erro: resultBoasVindas.ok ? null : resultBoasVindas.data?.error,
      notificacoes,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[boas-vindas] erro:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
