// @ts-nocheck
/**
 * Convite do recital por WhatsApp (LAPE-39, item 10 da reunião de 08/10/2026).
 *
 * A tela monta o texto (prévia) e manda ESTE texto; a edge não remonta nada, para o que
 * a pessoa leu ser exatamente o que sai. O que a edge decide sozinha é o DESTINO: o número
 * nunca vem do navegador, sai do cadastro do aluno (responsável quando há, senão o aluno).
 *
 * Sai pela caixa da SECRETARIA da unidade no Chatwoot (decisão do Hugo, 09/10/2026), então
 * a resposta da família cai na conversa da secretaria como qualquer outra.
 *
 * Modos:
 *   { modo: 'destinos', evento_id, pessoa_chave }  → quem receberia (sem enviar nada)
 *   { modo: 'enviar', evento_id, pessoa_chave, texto, destino_tipo, reenviar? }
 *
 * Resposta SEMPRE 200 para desfecho de negócio ({ ok, status, motivo, erro }): com 4xx/5xx
 * o supabase-js descarta o corpo e a tela não saberia dizer o que deu errado.
 * Registro de cada envio: public.evento_comunicacao (uma linha por clique em Enviar).
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const CW_URL = (Deno.env.get('CHATWOOT_URL') || '').replace(/\/+$/, '');
const CW_ACCOUNT = Deno.env.get('CHATWOOT_ACCOUNT_ID');
const CW_TOKEN = Deno.env.get('CHATWOOT_API_TOKEN');

// Caixa da secretaria de cada unidade no Chatwoot (WAHA). Conferido em 09/10/2026.
const INBOX_SECRETARIA: Record<string, number> = {
  '368d47f5-2d88-4475-bc14-ba084a9a348e': 179, // Barra — LA_secretaria_Barra
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': 180, // Campo Grande — LA_Secretaria_CG
  '95553e96-971b-4590-a6eb-0201d013c14d': 168, // Recreio — LA_Secretaria_Recreio
};

const CAMPOS = /\{(saudacao|responsavel|aluno|bloco|data|dia_semana|horario)\}/;
const RESERVA_ORFA_MS = 3 * 60 * 1000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Número no formato do WhatsApp (55 + DDD + número) ou null se não parece telefone BR. */
function numeroWhatsapp(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (!d.startsWith('55') || d.length < 12 || d.length > 13) return null;
  return d;
}
/** DDD + últimos 8 dígitos: casa o mesmo celular com e sem o 9º dígito. */
function chaveTelefone(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length < 10) return null;
  return d.slice(0, 2) + d.slice(-8);
}
const mesmaPessoa = (a, b) =>
  String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

async function cw(path, init = {}) {
  const res = await fetch(`${CW_URL}/api/v1/accounts/${CW_ACCOUNT}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', api_access_token: CW_TOKEN, ...(init.headers || {}) },
  });
  const texto = await res.text();
  let corpo = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = null; }
  return { ok: res.ok, status: res.status, corpo, texto };
}

async function acharContato(telefone) {
  const chave = chaveTelefone(telefone);
  const r = await cw(`/contacts/search?q=${encodeURIComponent(telefone.slice(-8))}`);
  if (!r.ok) throw new Error(`Chatwoot busca de contato: HTTP ${r.status} ${r.texto.slice(0, 200)}`);
  const lista = r.corpo?.payload ?? [];
  return lista.find((c) => chaveTelefone(c.phone_number) === chave) ?? null;
}

async function garantirContato(telefone, nome) {
  const existente = await acharContato(telefone);
  if (existente) return existente.id;
  const r = await cw('/contacts', {
    method: 'POST',
    body: JSON.stringify({ name: nome || telefone, phone_number: `+${telefone}` }),
  });
  if (r.ok) return r.corpo?.payload?.contact?.id ?? r.corpo?.payload?.id ?? r.corpo?.id;
  // 422 = telefone já cadastrado num formato que a busca não achou: tenta de novo pelo número inteiro.
  if (r.status === 422) {
    const r2 = await cw(`/contacts/search?q=${encodeURIComponent(telefone)}`);
    const achado = (r2.corpo?.payload ?? [])[0];
    if (achado) return achado.id;
  }
  throw new Error(`Chatwoot criar contato: HTTP ${r.status} ${r.texto.slice(0, 200)}`);
}

async function garantirConversa(contatoId, inboxId) {
  const r = await cw('/conversations', {
    method: 'POST',
    body: JSON.stringify({ contact_id: contatoId, inbox_id: inboxId, status: 'open' }),
  });
  if (r.ok) return r.corpo?.id;
  // O Chatwoot recusa uma 2ª conversa aberta do mesmo contato (422) e devolve a que existe.
  if (r.status === 422 && r.corpo?.conversation_id) return r.corpo.conversation_id;
  throw new Error(`Chatwoot criar conversa: HTTP ${r.status} ${r.texto.slice(0, 200)}`);
}

/** Lê o status da mensagem depois de alguns segundos: o WAHA marca `failed` quando não entrega. */
async function statusDaMensagem(conversaId, mensagemId) {
  await new Promise((r) => setTimeout(r, 4000));
  const r = await cw(`/conversations/${conversaId}/messages`);
  if (!r.ok) return { status: null };
  const msg = (r.corpo?.payload ?? []).find((m) => m.id === mensagemId);
  return {
    status: msg?.status ?? null,
    erro: msg?.content_attributes?.external_error ?? null,
  };
}

/** Quem recebe: responsável quando cadastrado (e não é o próprio aluno); senão o aluno. */
async function resolverDestinos(admin, participacao) {
  // Todas as matrículas da mesma pessoa: o contato pode estar preenchido só numa delas.
  const { data: ref, error: e1 } = await admin
    .from('alunos')
    .select('id, nome, unidade_id, responsavel_nome, responsavel_telefone, telefone, whatsapp')
    .eq('id', participacao.aluno_id)
    .maybeSingle();
  if (e1) throw new Error(`alunos ${participacao.aluno_id}: ${e1.message}`);
  if (!ref) return { aluno_nome: null, destinos: [] };

  let linhas = [ref];
  const { data: chaves } = await admin
    .from('vw_aluno_pessoa_chave')
    .select('pessoa_chave')
    .eq('aluno_id', ref.id)
    .maybeSingle();
  if (chaves?.pessoa_chave) {
    const { data: irmasIds } = await admin
      .from('vw_aluno_pessoa_chave')
      .select('aluno_id')
      .eq('unidade_id', ref.unidade_id)
      .eq('pessoa_chave', chaves.pessoa_chave);
    const ids = (irmasIds ?? []).map((x) => x.aluno_id).filter((id) => id !== ref.id);
    if (ids.length) {
      const { data: outras } = await admin
        .from('alunos')
        .select('id, nome, unidade_id, responsavel_nome, responsavel_telefone, telefone, whatsapp')
        .in('id', ids);
      linhas = [ref, ...(outras ?? [])];
    }
  }

  const destinos = [];
  const resp = linhas.find(
    (l) => numeroWhatsapp(l.responsavel_telefone) && l.responsavel_nome && !mesmaPessoa(l.responsavel_nome, l.nome),
  );
  if (resp) {
    destinos.push({
      tipo: 'responsavel',
      nome: resp.responsavel_nome.trim(),
      telefone: numeroWhatsapp(resp.responsavel_telefone),
    });
  }
  const proprio = linhas.map((l) => numeroWhatsapp(l.whatsapp) || numeroWhatsapp(l.telefone)).find(Boolean);
  if (proprio && !destinos.some((d) => chaveTelefone(d.telefone) === chaveTelefone(proprio))) {
    destinos.push({ tipo: 'aluno', nome: ref.nome, telefone: proprio });
  }
  return { aluno_nome: ref.nome, destinos };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, motivo: 'metodo_invalido' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  const usuario = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: auth } = await usuario.auth.getUser();
  if (!auth?.user) return json({ ok: false, motivo: 'nao_autenticado' }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, motivo: 'corpo_invalido' }); }
  const { modo, evento_id, pessoa_chave } = body ?? {};
  if (!evento_id || !pessoa_chave || !['destinos', 'enviar'].includes(modo)) {
    return json({ ok: false, motivo: 'parametros_invalidos' });
  }

  // Escopo pela RLS de quem clicou: se a pessoa não enxerga a participação, não envia.
  const { data: participacao, error: eP } = await usuario
    .from('evento_participacao')
    .select('id, evento_id, unidade_id, aluno_id, status, pessoa_chave')
    .eq('evento_id', evento_id)
    .eq('pessoa_chave', pessoa_chave)
    .maybeSingle();
  if (eP) return json({ ok: false, motivo: 'erro_leitura', erro: eP.message });
  if (!participacao) return json({ ok: false, motivo: 'fora_do_escopo' });

  const { data: evento } = await admin.from('evento').select('id, unidade_id').eq('id', evento_id).maybeSingle();
  const inboxId = INBOX_SECRETARIA[evento?.unidade_id];

  let resolvido;
  try {
    resolvido = await resolverDestinos(admin, participacao);
  } catch (e) {
    console.error(`evento-enviar-convite: destinos participacao ${participacao.id}:`, e.message);
    return json({ ok: false, motivo: 'erro_leitura', erro: e.message });
  }

  const { data: ultimos } = await admin
    .from('evento_comunicacao')
    .select('id, status, enviado_em, destino_nome, destino_telefone, erro')
    .eq('participacao_id', participacao.id)
    .eq('tipo', 'convite')
    .order('enviado_em', { ascending: false })
    .limit(1);
  const ultimo = ultimos?.[0] ?? null;

  if (modo === 'destinos') {
    return json({ ok: true, destinos: resolvido.destinos, ultimo, caixa_configurada: Boolean(inboxId) });
  }

  // ── enviar ──
  const texto = String(body.texto ?? '').trim();
  if (!texto) return json({ ok: false, motivo: 'texto_vazio' });
  if (texto.length > 4000) return json({ ok: false, motivo: 'texto_longo' });
  if (CAMPOS.test(texto)) return json({ ok: false, motivo: 'campo_nao_preenchido' });
  if (participacao.status !== 'participa') return json({ ok: false, motivo: 'nao_confirmado' });
  if (!inboxId) return json({ ok: false, motivo: 'sem_caixa_da_unidade' });
  if (!CW_URL || !CW_ACCOUNT || !CW_TOKEN) return json({ ok: false, motivo: 'chatwoot_sem_credencial' });

  const destino = resolvido.destinos.find((d) => d.tipo === body.destino_tipo) ?? resolvido.destinos[0];
  if (!destino) return json({ ok: false, motivo: 'sem_telefone' });
  if (ultimo?.status === 'enviado' && !body.reenviar) {
    return json({ ok: false, motivo: 'ja_enviado', ultimo });
  }

  const linha = {
    participacao_id: participacao.id,
    canal: 'whatsapp',
    tipo: 'convite',
    texto,
    status: 'enviando',
    destino_tipo: destino.tipo,
    destino_nome: destino.nome,
    destino_telefone: destino.telefone,
    chatwoot_inbox_id: inboxId,
    enviado_por: auth.user.id,
    origem: 'la_report',
    reenvio: Boolean(body.reenviar),
  };

  // Reserva ANTES de chamar o Chatwoot: o índice único deixa um só envio em andamento.
  let { data: reserva, error: eR } = await admin.from('evento_comunicacao').insert(linha).select('id').single();
  if (eR?.code === '23505') {
    // Reserva órfã (a edge caiu no meio) não pode travar a pessoa para sempre.
    const { data: presa } = await admin
      .from('evento_comunicacao')
      .select('id, enviado_em')
      .eq('participacao_id', participacao.id)
      .eq('tipo', 'convite')
      .eq('status', 'enviando')
      .maybeSingle();
    if (presa && Date.now() - new Date(presa.enviado_em).getTime() > RESERVA_ORFA_MS) {
      await admin.from('evento_comunicacao')
        .update({ status: 'erro', erro: 'envio interrompido (reserva expirada)', concluido_em: new Date().toISOString() })
        .eq('id', presa.id);
      ({ data: reserva, error: eR } = await admin.from('evento_comunicacao').insert(linha).select('id').single());
    } else {
      return json({ ok: false, motivo: 'ja_enviando' });
    }
  }
  if (eR || !reserva) {
    console.error(`evento-enviar-convite: reserva participacao ${participacao.id}:`, eR?.message);
    return json({ ok: false, motivo: 'erro_registro', erro: eR?.message });
  }

  const concluir = (campos) =>
    admin.from('evento_comunicacao')
      .update({ ...campos, concluido_em: new Date().toISOString() })
      .eq('id', reserva.id);

  try {
    const contatoId = await garantirContato(destino.telefone, destino.nome);
    const conversaId = await garantirConversa(contatoId, inboxId);
    const r = await cw(`/conversations/${conversaId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: texto, message_type: 'outgoing' }),
    });
    if (!r.ok || !r.corpo?.id) throw new Error(`Chatwoot enviar mensagem: HTTP ${r.status} ${r.texto.slice(0, 200)}`);
    const mensagemId = r.corpo.id;

    const entrega = await statusDaMensagem(conversaId, mensagemId);
    const falhou = entrega.status === 'failed';
    const erro = falhou ? (entrega.erro || 'o WhatsApp recusou a entrega') : null;
    await concluir({
      status: falhou ? 'erro' : 'enviado',
      erro,
      chatwoot_conversa_id: conversaId,
      chatwoot_mensagem_id: mensagemId,
    });
    if (falhou) console.error(`evento-enviar-convite: participacao ${participacao.id} conversa ${conversaId}: ${erro}`);
    return json({
      ok: !falhou,
      status: falhou ? 'erro' : 'enviado',
      motivo: falhou ? 'falha_na_entrega' : null,
      erro,
      destino,
      entrega: entrega.status,
      conversa_url: `${CW_URL}/app/accounts/${CW_ACCOUNT}/conversations/${conversaId}`,
    });
  } catch (e) {
    const erro = String(e?.message || e);
    console.error(`evento-enviar-convite: participacao ${participacao.id} telefone ${destino.telefone}:`, erro);
    await concluir({ status: 'erro', erro });
    return json({ ok: false, status: 'erro', motivo: 'falha_no_envio', erro, destino });
  }
});
