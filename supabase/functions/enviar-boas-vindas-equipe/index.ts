// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CAIXA_SUCESSO_ID = 3; // "Sol - Sucesso do Aluno" (UAZAPI)
const DEPARTAMENTO = 'sucesso_aluno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function normalizarTelefone(tel) {
  const limpo = String(tel || '').split('@')[0].replace(/\D/g, '');
  if (!limpo) return '';
  return limpo.startsWith('55') ? limpo : '55' + limpo;
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Resolve credenciais UAZAPI da caixa (self-contained; evita dependência de bundle do _shared via MCP).
async function getCaixaCreds(supabase, caixaId) {
  const { data, error } = await supabase
    .from('whatsapp_caixas')
    .select('id, nome, uazapi_url, uazapi_token')
    .eq('id', caixaId).eq('ativo', true).maybeSingle();
  if (error || !data) throw new Error(`Caixa UAZAPI ${caixaId} não encontrada/ativa`);
  let baseUrl = data.uazapi_url || '';
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) baseUrl = 'https://' + baseUrl;
  return { baseUrl: baseUrl.replace(/\/+$/, ''), token: data.uazapi_token };
}

// Registra a mensagem enviada na Caixa de Entrada (Forma A), para renderizar o carrossel
// com os cards. Vincula ao aluno se achar pelo telefone; senão cria conversa externa.
// O whatsapp_message_id permite ao webhook fromMe deduplicar (não gravar de novo como texto).
async function registrarNaCaixa(supabase, { numero, conteudo, tipo, whatsappMessageId, status, preview, nomeExterno }) {
  try {
    // O webhook grava whatsapp_jid/telefone_externo como número puro (sem @s.whatsapp.net).
    // Usar o mesmo formato para casar a conversa existente e não criar duplicata.
    const soNumero = String(numero).replace('@s.whatsapp.net', '').replace(/\D/g, '');
    const phoneSuffix = soNumero.slice(-11);

    const { data: aluno } = await supabase
      .from('alunos')
      .select('id, nome, unidade_id')
      .or(`telefone.like.%${phoneSuffix},whatsapp.like.%${phoneSuffix}`)
      .limit(1).maybeSingle();

    let conversaId = null;
    let alunoIdMsg = null;

    if (aluno) {
      alunoIdMsg = aluno.id;
      const { data: conv } = await supabase
        .from('admin_conversas').select('id')
        .eq('aluno_id', aluno.id).eq('departamento', DEPARTAMENTO).maybeSingle();
      if (conv) conversaId = conv.id;
      else {
        const { data: nova } = await supabase
          .from('admin_conversas')
          .insert({ aluno_id: aluno.id, unidade_id: aluno.unidade_id, departamento: DEPARTAMENTO, caixa_id: CAIXA_SUCESSO_ID, whatsapp_jid: soNumero, status: 'aberta' })
          .select('id').single();
        conversaId = nova?.id || null;
      }
    } else {
      // unidade_id NULL: a caixa é consolidada; o webhook só casa conversa externa com unidade_id NULL.
      // Busca por telefone_externo (formato estável) e não por whatsapp_jid (que varia de formato).
      const { data: conv } = await supabase
        .from('admin_conversas').select('id')
        .eq('telefone_externo', soNumero).eq('departamento', DEPARTAMENTO).is('aluno_id', null)
        .maybeSingle();
      if (conv) conversaId = conv.id;
      else {
        const { data: nova } = await supabase
          .from('admin_conversas')
          .insert({ aluno_id: null, unidade_id: null, departamento: DEPARTAMENTO, caixa_id: CAIXA_SUCESSO_ID, whatsapp_jid: soNumero, telefone_externo: soNumero, nome_externo: nomeExterno || null, status: 'aberta' })
          .select('id').single();
        conversaId = nova?.id || null;
      }
    }
    if (!conversaId) return;

    await supabase.from('admin_mensagens').insert({
      conversa_id: conversaId,
      aluno_id: alunoIdMsg,
      direcao: 'saida',
      tipo,
      conteudo,
      remetente: 'admin',
      remetente_nome: 'Sucesso do Aluno',
      status_entrega: status,
      whatsapp_message_id: whatsappMessageId || null,
    });

    await supabase.from('admin_conversas')
      .update({ ultima_mensagem_at: new Date().toISOString(), ultima_mensagem_preview: preview || '🎠 Boas-vindas da equipe', whatsapp_jid: soNumero, updated_at: new Date().toISOString() })
      .eq('id', conversaId);
  } catch (e) {
    console.error('[enviar-boas-vindas-equipe] erro ao registrar na caixa:', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { unidadeId, numeroDestino, responsavel, aluno, curso } = await req.json();
    const destino = normalizarTelefone(numeroDestino);
    if (!unidadeId) return json({ ok: false, erro: 'unidadeId é obrigatório' }, 400);
    if (!destino) return json({ ok: false, erro: 'numeroDestino inválido' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Unidade (comunidade + secretaria)
    const { data: uni, error: errUni } = await supabase
      .from('unidades')
      .select('id, nome, link_comunidade, secretaria_whatsapp, secretaria_fixo')
      .eq('id', unidadeId).maybeSingle();
    if (errUni || !uni) return json({ ok: false, erro: 'Unidade não encontrada' }, 404);

    // Equipe: locais (da unidade) + globais (unidade_id null)
    const { data: equipe, error: errEq } = await supabase
      .from('staff_unidade')
      .select('nome, cargo, foto_url, unidade_id, ordem')
      .eq('ativo', true)
      .or(`unidade_id.eq.${unidadeId},unidade_id.is.null`)
      .order('ordem');
    if (errEq) return json({ ok: false, erro: 'Falha ao ler equipe' }, 500);
    const locais = (equipe || []).filter((m) => m.unidade_id === unidadeId);
    const globais = (equipe || []).filter((m) => m.unidade_id === null);
    const ordenados = [...locais, ...globais];
    if (ordenados.length === 0) return json({ ok: false, erro: 'Sem equipe cadastrada para a unidade' }, 400);

    // Template (texto)
    const { data: tpl } = await supabase
      .from('crm_templates_whatsapp')
      .select('conteudo').eq('slug', 'boas_vindas_equipe').eq('ativo', true).maybeSingle();

    const listaEquipe = locais.map((m) => `• *${m.nome}* — ${m.cargo}`).join('\n');
    const texto = String(tpl?.conteudo || '')
      .replaceAll('{responsavel}', responsavel || '')
      .replaceAll('{aluno}', aluno || '')
      .replaceAll('{curso}', curso || '')
      .replaceAll('{unidade}', uni.nome || '')
      .replaceAll('{secretaria_whatsapp}', uni.secretaria_whatsapp || '')
      .replaceAll('{secretaria_fixo}', uni.secretaria_fixo || '')
      .replaceAll('{equipe}', listaEquipe);

    const cards = ordenados.map((m) => ({
      text: `*${m.nome}* — ${m.cargo}`,
      image: m.foto_url,
      buttons: [{ id: uni.link_comunidade, text: 'Entrar na comunidade', type: 'URL' }],
    }));

    const creds = await getCaixaCreds(supabase, CAIXA_SUCESSO_ID);

    // 1) Carrossel
    const respCar = await fetch(`${creds.baseUrl}/send/carousel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: creds.token },
      body: JSON.stringify({ number: destino, text: texto, carousel: cards, delay: 0 }),
    });
    const carData = await respCar.json().catch(() => ({}));
    if (!respCar.ok || carData?.error) {
      return json({ ok: false, erro: carData?.error || `UAZAPI carrossel ${respCar.status}` }, 502);
    }
    const carMessageId = carData.id || carData.messageid || carData.key?.id || null;

    // Registra o carrossel na Caixa (Forma A) com os cards estruturados, para renderizar
    // as fotos/botão. O webhook fromMe deduplica pelo whatsapp_message_id.
    const conteudoCarrossel = JSON.stringify({
      texto,
      cards: ordenados.map((m) => ({ nome: m.nome, cargo: m.cargo, foto: m.foto_url })),
      botao: { texto: 'Entrar na comunidade', url: uni.link_comunidade },
    });
    await registrarNaCaixa(supabase, {
      numero: destino,
      conteudo: conteudoCarrossel,
      tipo: 'carrossel',
      whatsappMessageId: carMessageId,
      status: 'enviada',
      preview: '🎠 Boas-vindas da equipe',
      nomeExterno: responsavel || aluno || null,
    });

    // 2) Comunidade (card nativo via preview de link)
    await fetch(`${creds.baseUrl}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: creds.token },
      body: JSON.stringify({
        number: destino,
        text: `📲 Entre na nossa *Comunidade do WhatsApp* para ficar por dentro de tudo, receber avisos e novidades! 👇\n\n${uni.link_comunidade}`,
        delay: 2500,
        linkPreview: true,
      }),
    });

    return json({ ok: true });
  } catch (err) {
    console.error('[enviar-boas-vindas-equipe] Erro:', err);
    return json({ ok: false, erro: err?.message || 'Erro interno' }, 500);
  }
});
