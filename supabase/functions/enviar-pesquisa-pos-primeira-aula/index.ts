// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const DEPARTAMENTO = 'sucesso_aluno';

const FOOTER_MENSAGEM = 'Toque em *Avaliar* e escolha uma opção 👇 — e, se quiser, me conta também o que mais gostou!';

function primeiroNome(nome) {
  if (!nome) return '';
  return String(nome).trim().split(/\s+/)[0];
}

// Monta o texto personalizado da pesquisa (tom acolhedor da Fabi).
function montarTexto(nome, curso) {
  const pnome = primeiroNome(nome);
  const saudacao = pnome ? `Olá, ${pnome}! 😊` : 'Olá! 😊';
  const trechoCurso = curso ? ` de ${curso}` : '';
  return (
    `${saudacao}\n\n` +
    `Sou a Fabi, da equipe de *Sucesso do Cliente da LA* 🤩\n\n` +
    `Passando para saber como têm sido suas aulas${trechoCurso}. ` +
    `Esse é um momento muito especial, cheio de expectativas, e para nós é muito importante entender como você tem se sentido nesse comecinho da sua jornada musical.\n\n` +
    `*Como você avalia suas primeiras aulas?*`
  );
}

// Formato UAZAPI /send/menu com type=list: choices = ["[Seção]", "label|id", ...]
const CHOICES = [
  '[Sua avaliação]',
  '⭐ Esperava mais|esperava_mais',
  '⭐⭐ Foi ok|foi_ok',
  '⭐⭐⭐ Gostei|gostei',
  '⭐⭐⭐⭐ Gostei muito|gostei_muito',
  '⭐⭐⭐⭐⭐ Amei|amei',
];

const OPCOES_INTERATIVO = [
  { id: 'esperava_mais', label: '⭐ Esperava mais' },
  { id: 'foi_ok',        label: '⭐⭐ Foi ok' },
  { id: 'gostei',        label: '⭐⭐⭐ Gostei' },
  { id: 'gostei_muito',  label: '⭐⭐⭐⭐ Gostei muito' },
  { id: 'amei',          label: '⭐⭐⭐⭐⭐ Amei' },
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function enviarBotoes(baseUrl, token, numero, texto) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const body = {
      number: numero,
      type: 'list',
      text: texto,
      footerText: FOOTER_MENSAGEM,
      listButton: 'Avaliar',
      choices: CHOICES,
      delay: 500,
      readchat: true,
    };
    const resp = await fetch(`${baseUrl}/send/menu`, {
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

async function registrarNaCaixa(supabase, { alunoId, unidadeId, jid, caixaId, messageId, status, texto }) {
  try {
    let conversaId = null;

    const { data: conv } = await supabase
      .from('admin_conversas')
      .select('id')
      .eq('aluno_id', alunoId)
      .eq('departamento', DEPARTAMENTO)
      .maybeSingle();

    if (conv) {
      conversaId = conv.id;
    } else {
      const { data: nova } = await supabase
        .from('admin_conversas')
        .insert({
          aluno_id: alunoId,
          unidade_id: unidadeId,
          departamento: DEPARTAMENTO,
          caixa_id: caixaId,
          whatsapp_jid: jid,
          status: 'aberta',
        })
        .select('id')
        .single();
      conversaId = nova?.id || null;
    }

    if (!conversaId) return;

    const conteudoInterativo = JSON.stringify({
      texto,
      opcoes: OPCOES_INTERATIVO,
    });

    await supabase.from('admin_mensagens').insert({
      conversa_id: conversaId,
      aluno_id: alunoId,
      direcao: 'saida',
      tipo: 'interativo',
      conteudo: conteudoInterativo,
      remetente: 'admin',
      remetente_nome: 'Fabi',
      status_entrega: status,
      whatsapp_message_id: messageId || null,
    });

    await supabase.from('admin_conversas')
      .update({
        ultima_mensagem_at: new Date().toISOString(),
        ultima_mensagem_preview: 'Como você avalia suas primeiras aulas?',
        whatsapp_jid: jid,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversaId);
  } catch (e) {
    console.error('[enviar-pesquisa] erro ao registrar na caixa:', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { alunos } = await req.json();
    if (!Array.isArray(alunos) || alunos.length === 0) {
      return new Response(JSON.stringify({ error: 'alunos obrigatorio e nao pode ser vazio' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const resultados = [];

    // Agrupar por unidade para minimizar lookups de caixa
    const porUnidade = {};
    for (const aluno of alunos) {
      if (!porUnidade[aluno.unidade_id]) porUnidade[aluno.unidade_id] = [];
      porUnidade[aluno.unidade_id].push(aluno);
    }

    for (const [unidadeId, grupo] of Object.entries(porUnidade)) {
      let caixa = null;

      const { data: caixaUnidade } = await supabase
        .from('whatsapp_caixas')
        .select('id, uazapi_url, uazapi_token')
        .eq('departamento', DEPARTAMENTO)
        .eq('unidade_id', unidadeId)
        .eq('ativo', true)
        .maybeSingle();

      if (caixaUnidade) {
        caixa = caixaUnidade;
      } else {
        const { data: caixaGeral } = await supabase
          .from('whatsapp_caixas')
          .select('id, uazapi_url, uazapi_token')
          .eq('departamento', DEPARTAMENTO)
          .eq('ativo', true)
          .limit(1)
          .maybeSingle();
        caixa = caixaGeral;
      }

      if (!caixa) {
        for (const a of grupo) {
          resultados.push({ aluno_id: a.aluno_id, ok: false, erro: 'caixa_sucesso_aluno_nao_encontrada' });
        }
        continue;
      }

      let baseUrl = caixa.uazapi_url || '';
      if (baseUrl && !baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
      baseUrl = baseUrl.replace(/\/+$/, '');
      const token = caixa.uazapi_token;

      for (let i = 0; i < grupo.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 10000));
        const aluno = grupo[i];
        const { aluno_id, unidade_id, whatsapp_jid, data_matricula, nome, curso } = aluno;
        const textoMsg = montarTexto(nome, curso);

        if (!whatsapp_jid) {
          resultados.push({ aluno_id, ok: false, erro: 'sem_contato' });
          continue;
        }

        const numero = whatsapp_jid.replace('@s.whatsapp.net', '');

        // Contato externo (aluno_id=null): só envia, sem registro no banco
        if (!aluno_id) {
          const resultado = await enviarBotoes(baseUrl, token, numero, textoMsg);
          resultados.push({ aluno_id: null, ok: resultado.ok, erro: resultado.ok ? undefined : (resultado.data?.error || 'falha_envio') });
          continue;
        }

        // Upsert idempotente — reutiliza linha de tentativa anterior
        const { error: upsertErr } = await supabase
          .from('pesquisas_whatsapp')
          .upsert(
            { aluno_id, unidade_id, tipo: 'pos_primeira_aula', data_matricula, enviado_ok: false, erro_detalhes: null },
            { onConflict: 'aluno_id,tipo,data_matricula' }
          );

        if (upsertErr) {
          console.error('[enviar-pesquisa] upsert erro:', upsertErr);
          resultados.push({ aluno_id, ok: false, erro: upsertErr.message });
          continue;
        }

        const resultado = await enviarBotoes(baseUrl, token, numero, textoMsg);

        if (resultado.ok) {
          await supabase
            .from('pesquisas_whatsapp')
            .update({ enviado_ok: true, enviado_em: new Date().toISOString(), remote_jid: whatsapp_jid })
            .eq('aluno_id', aluno_id)
            .eq('tipo', 'pos_primeira_aula')
            .eq('data_matricula', data_matricula);

          await registrarNaCaixa(supabase, {
            alunoId: aluno_id,
            unidadeId: unidade_id,
            jid: whatsapp_jid,
            caixaId: caixa.id,
            messageId: resultado.messageId,
            status: 'enviada',
            texto: textoMsg,
          });

          resultados.push({ aluno_id, ok: true });
        } else {
          await supabase
            .from('pesquisas_whatsapp')
            .update({ erro_detalhes: JSON.stringify(resultado.data) })
            .eq('aluno_id', aluno_id)
            .eq('tipo', 'pos_primeira_aula')
            .eq('data_matricula', data_matricula);

          resultados.push({ aluno_id, ok: false, erro: resultado.data?.error || 'falha_envio' });
        }
      }
    }

    return new Response(JSON.stringify({ resultados }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[enviar-pesquisa] erro:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
