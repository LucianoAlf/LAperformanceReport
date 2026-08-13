// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const DEPARTAMENTO = 'sucesso_aluno';

// Janela da trava anti-duplicata do AUTO-disparo. As 42 duplicatas medidas (30 alunos, desde
// 03/07/2026) ficaram todas dentro de 60s; o reenvio espaçado mais próximo está a 19,5h. Ou
// seja: 10 min separa acidente de reenvio legítimo com folga dos dois lados.
const JANELA_ANTIDUPLICATA_MIN = 10;

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

function normalizarNome(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// Substitui placeholders {nome} (aluno), {responsavel}, {curso}. Se curso vazio, remove os
// wrappers comuns (" de {curso}", " ({curso})") para não deixar texto órfão.
function aplicarPlaceholders(template, { aluno, responsavel, curso }) {
  const pAluno = primeiroNome(aluno);
  const pResp = primeiroNome(responsavel) || pAluno;
  let txt = String(template || '').replace(/\{nome\}/g, pAluno).replace(/\{responsavel\}/g, pResp);
  if (curso) {
    txt = txt.replace(/\{curso\}/g, curso);
  } else {
    txt = txt.replace(/ de \{curso\}/g, '').replace(/ ?\(\{curso\}\)/g, '').replace(/\{curso\}/g, '');
  }
  return txt;
}

// Escolhe a variante do texto: responsável distinto do aluno => fala do filho (3ª pessoa);
// mesma pessoa (ou sem responsável) => direto (2ª pessoa). Fallback ao texto do código.
function montarTextoPesquisa(templates, { nome, curso, responsavelNome }) {
  const temRespDistinto = !!responsavelNome
    && normalizarNome(responsavelNome) !== ''
    && normalizarNome(responsavelNome) !== normalizarNome(nome);
  const slug = temRespDistinto ? 'pesquisa_1a_aula_responsavel' : 'pesquisa_1a_aula_direta';
  const template = templates[slug];
  if (!template) return montarTexto(nome, curso);
  return aplicarPlaceholders(template, {
    aluno: nome,
    responsavel: temRespDistinto ? responsavelNome : nome,
    curso,
  });
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

function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

// O aluno pode ter mais de uma conversa no mesmo departamento: a de boas-vindas nasce no
// telefone do responsável e depois aparece a do telefone dele. Por isso a conversa é casada
// pelo telefone da mensagem, e não por "a conversa do aluno".
async function resolverConversaAluno(supabase, { alunoId, unidadeId, jid, caixaId }) {
  const alvo = somenteDigitos(jid);

  const { data: existentes } = await supabase
    .from('admin_conversas')
    .select('id, whatsapp_jid')
    .eq('aluno_id', alunoId)
    .eq('departamento', DEPARTAMENTO);

  const conversas = existentes || [];
  const doTelefone = conversas.find((c) => somenteDigitos(c.whatsapp_jid) === alvo);
  if (doTelefone) return doTelefone.id;

  const semTelefone = conversas.find((c) => !c.whatsapp_jid);
  if (semTelefone) return semTelefone.id;

  const { data: nova, error: criarErr } = await supabase
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
  if (nova?.id) return nova.id;

  // uq_admin_conversas_jid_depto recusa o insert quando o número já tem conversa — corrida com
  // o webhook, ou conversa aberta como contato externo antes de virar aluno.
  const { data: porJid } = await supabase
    .from('admin_conversas')
    .select('id')
    .eq('whatsapp_jid', jid)
    .eq('departamento', DEPARTAMENTO)
    .maybeSingle();
  if (porJid?.id) return porJid.id;

  console.error('[enviar-pesquisa] conversa nao resolvida:', { alunoId, jid, erro: criarErr?.message });
  return null;
}

async function registrarNaCaixa(supabase, { alunoId, unidadeId, jid, caixaId, messageId, status, texto, nomeExterno }) {
  try {
    let conversaId = null;

    if (alunoId) {
      conversaId = await resolverConversaAluno(supabase, { alunoId, unidadeId, jid, caixaId });
    } else {
      // Contato externo: busca conversa pelo JID
      const { data: conv } = await supabase
        .from('admin_conversas')
        .select('id')
        .eq('whatsapp_jid', jid)
        .eq('departamento', DEPARTAMENTO)
        .is('aluno_id', null)
        .maybeSingle();

      if (conv) {
        conversaId = conv.id;
      } else {
        const telefone = jid.replace('@s.whatsapp.net', '');
        const { data: nova } = await supabase
          .from('admin_conversas')
          .insert({
            aluno_id: null,
            unidade_id: unidadeId,
            departamento: DEPARTAMENTO,
            caixa_id: caixaId,
            whatsapp_jid: jid,
            telefone_externo: telefone,
            nome_externo: nomeExterno || null,
            status: 'aberta',
          })
          .select('id')
          .single();
        conversaId = nova?.id || null;

        if (!conversaId) {
          const { data: porJid } = await supabase
            .from('admin_conversas')
            .select('id')
            .eq('whatsapp_jid', jid)
            .eq('departamento', DEPARTAMENTO)
            .maybeSingle();
          conversaId = porJid?.id || null;
        }
      }
    }

    if (!conversaId) return;

    const conteudoInterativo = JSON.stringify({
      texto,
      opcoes: OPCOES_INTERATIVO,
    });

    const { error: msgErr } = await supabase.from('admin_mensagens').insert({
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

    // Sem isto a pesquisa some da Caixa em silêncio: o envio ao WhatsApp já saiu e a edge
    // responde ok. O eco do webhook até grava a mensagem, mas achatada em texto.
    if (msgErr) {
      console.error('[enviar-pesquisa] mensagem nao gravada na caixa:', { alunoId, conversaId, erro: msgErr.message });
    }

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
    const body = await req.json();
    const alunos = body?.alunos;
    const dryRun = body?.dry_run === true;
    // Só o caminho automático trava duplicata (decisão Hugo, 13/08/2026). Chamada sem origem
    // — a aba Pós-1ª Aula — segue livre para reenviar.
    const origemAuto = body?.origem === 'auto';
    if (!Array.isArray(alunos) || alunos.length === 0) {
      return new Response(JSON.stringify({ error: 'alunos obrigatorio e nao pode ser vazio' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const resultados = [];

    // Textos editáveis (aluno x responsável). Se ausentes, cai no texto do código.
    const { data: tplRows } = await supabase
      .from('crm_templates_whatsapp')
      .select('slug, conteudo')
      .in('slug', ['pesquisa_1a_aula_direta', 'pesquisa_1a_aula_responsavel']);
    const templates = {};
    for (const t of tplRows || []) templates[t.slug] = t.conteudo;

    // Nome do responsável por aluno (decide se fala com o aluno ou com o responsável).
    const idsAlunos = alunos.map((a) => a.aluno_id).filter(Boolean);
    const respPorAluno = {};
    if (idsAlunos.length) {
      const { data: rowsAlunos } = await supabase
        .from('alunos')
        .select('id, responsavel_nome')
        .in('id', idsAlunos);
      for (const r of rowsAlunos || []) respPorAluno[r.id] = r.responsavel_nome || null;
    }

    // Dry-run: só monta os textos (não envia, não grava). Para validar as variantes.
    if (dryRun) {
      const previews = alunos.map((a) => {
        const respNome = a.aluno_id ? respPorAluno[a.aluno_id] : null;
        const variante = (respNome && normalizarNome(respNome) !== '' && normalizarNome(respNome) !== normalizarNome(a.nome))
          ? 'responsavel' : 'direta';
        return {
          aluno_id: a.aluno_id,
          nome: a.nome,
          responsavel: respNome,
          variante,
          texto: montarTextoPesquisa(templates, { nome: a.nome, curso: a.curso, responsavelNome: respNome }),
        };
      });
      return new Response(JSON.stringify({ dry_run: true, previews }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
        const textoMsg = montarTextoPesquisa(templates, {
          nome,
          curso,
          responsavelNome: aluno_id ? respPorAluno[aluno_id] : null,
        });

        if (!whatsapp_jid) {
          resultados.push({ aluno_id, ok: false, erro: 'sem_contato' });
          continue;
        }

        const numero = whatsapp_jid.replace('@s.whatsapp.net', '');

        // Contato externo (aluno_id=null): envia e registra na caixa (sem gravar em pesquisas_whatsapp)
        if (!aluno_id) {
          const resultado = await enviarBotoes(baseUrl, token, numero, textoMsg);
          if (resultado.ok) {
            await registrarNaCaixa(supabase, {
              alunoId: null,
              unidadeId: unidade_id,
              jid: whatsapp_jid,
              caixaId: caixa.id,
              messageId: resultado.messageId,
              status: 'enviada',
              texto: textoMsg,
              nomeExterno: nome || null,
            });
          }
          resultados.push({ aluno_id: null, ok: resultado.ok, erro: resultado.ok ? undefined : (resultado.data?.error || 'falha_envio') });
          continue;
        }

        if (origemAuto) {
          // Reserva ATÔMICA antes do POST: das execuções paralelas, uma leva a linha e as
          // outras recebem false. Consultar-e-então-enviar não serviria — elas leem no mesmo
          // segundo, antes de qualquer marcação.
          const { data: reservou, error: reservaErr } = await supabase.rpc(
            'reservar_envio_pesquisa_whatsapp',
            {
              p_aluno_id: aluno_id,
              p_unidade_id: unidade_id,
              p_tipo: 'pos_primeira_aula',
              p_data_matricula: data_matricula,
              p_janela_minutos: JANELA_ANTIDUPLICATA_MIN,
            },
          );

          if (reservaErr) {
            console.error('[enviar-pesquisa] reserva falhou:', reservaErr);
            resultados.push({ aluno_id, ok: false, erro: reservaErr.message });
            continue;
          }

          if (reservou !== true) {
            // ok:true de propósito — a pesquisa saiu, só que por outra execução. Como falha,
            // a orquestradora concluiria que ninguém recebeu e reenviaria o lote inteiro.
            resultados.push({ aluno_id, ok: true, pulado: 'ja_enviada_recentemente' });
            continue;
          }
        } else {
          // Manual (aba Pós-1ª Aula): sem trava — a Fabi reenvia quando quiser, inclusive
          // segundos depois. Upsert idempotente, reutiliza linha de tentativa anterior.
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
          // Libera a reserva. Sem isto, uma falha real prenderia o aluno pela janela inteira e
          // o retry da orquestradora (5s depois) não teria efeito. No manual já é nulo.
          await supabase
            .from('pesquisas_whatsapp')
            .update({ erro_detalhes: JSON.stringify(resultado.data), tentativa_envio_em: null })
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
