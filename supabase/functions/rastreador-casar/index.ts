/// <reference lib="deno.ns" />
// Edge Function: rastreador-casar  (verify_jwt=true)
//
// Casa a primeira mensagem do lead no Chatwoot com o clique registrado por `ir-whatsapp`,
// lendo o codigo invisivel que vem no fim do texto.
//
//   POST {"varrer": true}   -> cron (*/5 min): le as conversas novas das caixas Mila no Chatwoot,
//                              casa o codigo, resolve lead_id e fecha cliques sem conversa.
//                              E O CAMINHO PRINCIPAL: nada fora do Supabase precisa ser configurado.
//   POST <payload message_created do Chatwoot>  -> casa na hora (opcional, se um dia houver webhook)
//
// ORDEM DE CONFIANCA: codigo (certo) > atraso do WhatsApp (forte) > janela de horario (provavel).
//
// O que faz no modo casar:
//   1. ignora o que nao e mensagem recebida (incoming) ou nao tem codigo;
//   2. acha o clique pelo codigo (so os ainda 'aguardando' e dos ultimos 3 dias);
//   3. grava telefone, conversa e o atraso clique->mensagem no clique, e tenta achar o lead.
//
// NAO altera `leads` (canal, origem). So registra a ligacao clique -> telefone -> lead; aplicar
// no lead e passo separado, depois de conferir o casamento com dado real.
//
// ⚠️ O lead pode nascer DEPOIS do evento (a mensagem chega ~1-4s antes de o lead existir, ver
// registrar-atribuicao-google-ads). Por isso o lead_id e resolvido tambem pelo modo `varrer`.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { candidatosDoTexto, candidatosTelefone } from '../_shared/rastreador.ts';

const JANELA_CASAR_DIAS = 3;
// Caixa Mila -> unidade do link (`ir-whatsapp?u=`): 147 Barra, 148 Recreio, 155 Campo Grande.
const UNIDADE_POR_INBOX: Record<number, string> = { 147: 'barra', 148: 'recreio', 155: 'cg' };
const JANELA_LEAD_DIAS = 7;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

type MsgCw = {
  message_type?: number | string;
  content?: string | null;
  created_at?: number;
  content_attributes?: {
    external_ad_reply?: { entry_point_conversion_source?: string; entry_point_conversion_delay_seconds?: number };
  } | null;
};

/**
 * Segundos entre o toque no link e o envio da 1a mensagem, como o PROPRIO WhatsApp registra
 * (`external_ad_reply.entry_point_conversion_delay_seconds`, so em conversa aberta por link
 * `click_to_chat_link`). Hora da mensagem - atraso = o instante do clique, ao segundo.
 */
function atrasoDaMensagem(m: Pick<MsgCw, 'content_attributes'>): number | null {
  const ad = m.content_attributes?.external_ad_reply;
  if (!ad || ad.entry_point_conversion_source !== 'click_to_chat_link') return null;
  const s = Number(ad.entry_point_conversion_delay_seconds);
  return Number.isFinite(s) && s >= 0 ? s : null;
}

// Aceita o webhook cru do Chatwoot e tambem um corpo simples {telefone, texto, conversa_id}.
function normalizar(body: Record<string, any>) {
  const tipo = body?.message_type; // 'incoming' | 0 | 'outgoing' | 1
  const incoming = tipo === undefined || tipo === 'incoming' || tipo === 0;
  const texto = String(body?.content ?? body?.texto ?? body?.message?.content ?? '');
  const telefone = String(
    body?.sender?.phone_number ?? body?.conversation?.meta?.sender?.phone_number ?? body?.telefone ?? '',
  );
  const conversaId = body?.conversation?.id ?? body?.conversa_id ?? null;
  const criadoEm = body?.created_at ?? body?.conversation?.created_at ?? null;
  const inboxId = Number(body?.inbox?.id ?? body?.conversation?.inbox_id ?? body?.inbox_id) || null;
  const atrasoSeg = atrasoDaMensagem({ content_attributes: body?.content_attributes ?? body?.message?.content_attributes });
  return { incoming, texto, telefone, conversaId, criadoEm, inboxId, atrasoSeg };
}

async function acharLead(supabase: SupabaseClient, telefone: string): Promise<number | null> {
  const candidatos = candidatosTelefone(telefone);
  if (candidatos.length === 0) return null;
  const { data, error } = await supabase
    .from('leads')
    .select('id')
    .in('telefone', candidatos)
    .eq('arquivado', false)
    .limit(2);
  if (error) throw error;
  // 2+ leads com o mesmo telefone: nao escolhemos (mesma politica das outras edges).
  return data && data.length === 1 ? data[0].id : null;
}

/** Procura o clique do codigo e grava telefone/conversa/lead nele. Usado pelo webhook e pela varredura. */
async function aplicarCasamento(
  supabase: SupabaseClient,
  a: { candidatos: string[]; telefone: string; conversaId: number | null; criadoEm: number | string | null },
): Promise<Record<string, unknown>> {
  const corte = new Date(Date.now() - JANELA_CASAR_DIAS * 86400_000).toISOString();
  const { data: cliques, error } = await supabase
    .from('rastreio_cliques')
    .select('id, created_at')
    .in('codigo', a.candidatos)
    .eq('situacao', 'aguardando')
    .gte('created_at', corte)
    .order('created_at', { ascending: false })
    .limit(2);
  if (error) throw error;

  if (!cliques || cliques.length === 0) return { action: 'codigo_sem_clique_pendente' };
  // Dois cliques com o mesmo codigo ainda abertos: colisao (raro). Nao adivinha.
  if (cliques.length > 1) return { action: 'codigo_ambiguo' };

  const clique = cliques[0];
  const agora = a.criadoEm
    ? new Date(typeof a.criadoEm === 'number' ? a.criadoEm * 1000 : a.criadoEm)
    : new Date();
  const delay = Math.max(0, Math.round((agora.getTime() - new Date(clique.created_at).getTime()) / 1000));

  let leadId: number | null = null;
  try {
    leadId = await acharLead(supabase, a.telefone);
  } catch (e) {
    console.error('[rastreador-casar] falha ao buscar lead (segue sem):', e instanceof Error ? e.message : e);
  }

  const { error: upErr } = await supabase
    .from('rastreio_cliques')
    .update({
      situacao: 'casado',
      metodo_casamento: 'codigo',
      telefone_lead: candidatosTelefone(a.telefone)[0] ?? a.telefone,
      chatwoot_conversation_id: a.conversaId,
      lead_id: leadId,
      delay_segundos: delay,
      casado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', clique.id)
    .eq('situacao', 'aguardando'); // trava contra casar duas vezes em corrida
  if (upErr) throw upErr;

  return { action: 'casado', clique_id: clique.id, lead_id: leadId, delay_segundos: delay };
}

async function casar(supabase: SupabaseClient, body: Record<string, any>) {
  const { incoming, texto, telefone, conversaId, criadoEm, inboxId, atrasoSeg } = normalizar(body);
  if (!incoming) return json({ ok: true, action: 'ignorado_nao_incoming' });

  const candidatos = candidatosDoTexto(texto);
  if (candidatos.length === 0) {
    // Sem codigo (texto apagado/trocado): o atraso que o WhatsApp registra ainda identifica o clique.
    const unidade = inboxId != null ? UNIDADE_POR_INBOX[inboxId] : undefined;
    if (atrasoSeg !== null && unidade && telefone) {
      const msgEmSeg = typeof criadoEm === 'number' ? criadoEm : Math.floor(Date.parse(String(criadoEm)) / 1000);
      if (Number.isFinite(msgEmSeg)) {
        const r = await casarPorAtraso(supabase, { unidade, telefone, conversaId, msgEmSeg, atrasoSeg });
        return json({ ok: true, ...r });
      }
    }
    return json({ ok: true, action: 'sem_codigo' });
  }
  if (!telefone) return json({ ok: true, action: 'sem_telefone' });

  const r = await aplicarCasamento(supabase, { candidatos, telefone, conversaId, criadoEm });
  return json({ ok: true, ...r });
}

// Caixas "Mila" (Barra 147, Recreio 148, CG 155): sao o destino dos links rastreados.
const INBOXES_MILA = new Set([147, 148, 155]);
const JANELA_CHATWOOT_MIN = 30; // o cron roda a cada 5 min; a sobra cobre atraso e re-tentativa
const MAX_PAGINAS_CHATWOOT = 12;
const MAX_CONVERSAS_POR_RODADA = 60;

const JANELA_CLIQUE_MIN = 10; // clique ate N min ANTES da primeira mensagem
const SILENCIO_ABERTURA_SEG = 3600; // so conta como "abertura" se a conversa estava calada ha 1h

/**
 * RESERVA para o lead que apaga ou troca o texto pre-preenchido (o codigo invisivel vai junto com
 * ele). Casa por UNIDADE + PROXIMIDADE DE HORARIO: o clique ainda `aguardando` dessa unidade,
 * ate JANELA_CLIQUE_MIN antes da mensagem. Fica marcado `metodo_casamento='janela'` (provavel),
 * para o relatorio nunca misturar com o casamento certo (`codigo`).
 *
 * Nao adivinha: se os candidatos vieram de aparelhos diferentes (user-agent), nao casa. O mesmo
 * aparelho clicando 2x (voltou e clicou de novo) e a mesma pessoa: casa com o clique mais recente.
 */
async function casarPorJanela(
  supabase: SupabaseClient,
  a: { unidade: string; telefone: string; conversaId: number; msgEmSeg: number },
): Promise<Record<string, unknown>> {
  const fim = new Date(a.msgEmSeg * 1000);
  const ini = new Date(fim.getTime() - JANELA_CLIQUE_MIN * 60_000);

  // Uma mensagem de abertura so pode "consumir" UM clique. Sem isto, a rodada seguinte da varredura
  // (a janela de leitura e maior que o intervalo do cron) casava o clique que sobrou do MESMO
  // contato -- e, com gente de verdade, poderia tomar o clique de outra pessoa.
  const { count: jaTem, error: jaErr } = await supabase
    .from('rastreio_cliques')
    .select('id', { count: 'exact', head: true })
    .eq('chatwoot_conversation_id', a.conversaId)
    .eq('situacao', 'casado')
    .gte('casado_em', ini.toISOString());
  if (jaErr) throw jaErr;
  if (jaTem) return { action: 'janela_conversa_ja_casada' };

  const { data: cands, error } = await supabase
    .from('rastreio_cliques')
    .select('id, created_at, user_agent')
    .eq('situacao', 'aguardando')
    .eq('unidade', a.unidade)
    .gte('created_at', ini.toISOString())
    .lte('created_at', fim.toISOString())
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  if (!cands || cands.length === 0) return { action: 'janela_sem_candidato' };
  if (cands.some((c) => c.user_agent !== cands[0].user_agent)) {
    return { action: 'janela_ambigua', candidatos: cands.length };
  }

  const clique = cands[0];
  const delay = Math.max(0, Math.round((fim.getTime() - new Date(clique.created_at).getTime()) / 1000));
  let leadId: number | null = null;
  try {
    leadId = await acharLead(supabase, a.telefone);
  } catch (e) {
    console.error('[rastreador-casar] falha ao buscar lead (segue sem):', e instanceof Error ? e.message : e);
  }
  const { error: upErr } = await supabase
    .from('rastreio_cliques')
    .update({
      situacao: 'casado',
      metodo_casamento: 'janela',
      telefone_lead: candidatosTelefone(a.telefone)[0] ?? a.telefone,
      chatwoot_conversation_id: a.conversaId,
      lead_id: leadId,
      delay_segundos: delay,
      casado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', clique.id)
    .eq('situacao', 'aguardando');
  if (upErr) throw upErr;
  return { action: 'casado', clique_id: clique.id, lead_id: leadId, delay_segundos: delay };
}

// O clique no NOSSO link precede a abertura do WhatsApp (dialogo "Abrir no WhatsApp", troca de app):
// medido em 08/10, 5 s. Por isso a janela e larga para tras e curta para frente.
const ATRASO_ANTES_SEG = 120;
const ATRASO_DEPOIS_SEG = 15;
const ATRASO_FOLGA_AMBIGUO_SEG = 10;

/**
 * Casamento pelo ATRASO EXATO do WhatsApp: UNIDADE + instante do clique (hora da mensagem - atraso).
 * Funciona mesmo que o lead apague o texto (e o codigo junto) e mesmo que espere horas.
 *
 * Se o WhatsApp diz que a conversa veio de um link e NENHUM clique nosso bate com aquele instante, a
 * conversa veio de OUTRO link (bio, link direto): NAO cai na janela de horario -- seria um falso positivo.
 */
async function casarPorAtraso(
  supabase: SupabaseClient,
  a: { unidade: string; telefone: string; conversaId: number | null; msgEmSeg: number; atrasoSeg: number },
): Promise<Record<string, unknown>> {
  const msgIso = new Date(a.msgEmSeg * 1000).toISOString();

  // Uma mensagem consome UM clique (a varredura repete a janela de leitura varias vezes).
  if (a.conversaId != null) {
    const { count: jaTem, error: jaErr } = await supabase
      .from('rastreio_cliques')
      .select('id', { count: 'exact', head: true })
      .eq('chatwoot_conversation_id', a.conversaId)
      .eq('situacao', 'casado')
      .gte('casado_em', msgIso);
    if (jaErr) throw jaErr;
    if (jaTem) return { action: 'atraso_conversa_ja_casada' };
  }

  const aberturaMs = (a.msgEmSeg - a.atrasoSeg) * 1000;
  const { data: cands, error } = await supabase
    .from('rastreio_cliques')
    .select('id, created_at, user_agent')
    .eq('situacao', 'aguardando')
    .eq('unidade', a.unidade)
    .gte('created_at', new Date(aberturaMs - ATRASO_ANTES_SEG * 1000).toISOString())
    .lte('created_at', new Date(aberturaMs + ATRASO_DEPOIS_SEG * 1000).toISOString())
    .limit(10);
  if (error) throw error;
  if (!cands || cands.length === 0) return { action: 'atraso_sem_clique' };

  // O clique mais proximo de "abertura - 5 s" (o atraso tipico entre o clique e o WhatsApp abrir).
  const alvoMs = aberturaMs - 5000;
  const ordenados = cands
    .map((c) => ({ ...c, dist: Math.abs(new Date(c.created_at).getTime() - alvoMs) }))
    .sort((x, y) => x.dist - y.dist);
  const mesmoAparelho = ordenados.every((c) => c.user_agent === ordenados[0].user_agent);
  if (ordenados.length > 1 && !mesmoAparelho && ordenados[1].dist - ordenados[0].dist < ATRASO_FOLGA_AMBIGUO_SEG * 1000) {
    return { action: 'atraso_ambiguo', candidatos: ordenados.length };
  }

  const clique = ordenados[0];
  const delay = Math.max(0, Math.round((a.msgEmSeg * 1000 - new Date(clique.created_at).getTime()) / 1000));
  let leadId: number | null = null;
  try {
    leadId = await acharLead(supabase, a.telefone);
  } catch (e) {
    console.error('[rastreador-casar] falha ao buscar lead (segue sem):', e instanceof Error ? e.message : e);
  }
  const { error: upErr } = await supabase
    .from('rastreio_cliques')
    .update({
      situacao: 'casado',
      metodo_casamento: 'atraso',
      telefone_lead: candidatosTelefone(a.telefone)[0] ?? a.telefone,
      chatwoot_conversation_id: a.conversaId,
      lead_id: leadId,
      delay_segundos: delay,
      casado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', clique.id)
    .eq('situacao', 'aguardando');
  if (upErr) throw upErr;
  return { action: 'casado', metodo: 'atraso', clique_id: clique.id, lead_id: leadId, delay_segundos: delay };
}

/**
 * Le as conversas novas das caixas Mila direto do Chatwoot e casa o codigo da primeira
 * mensagem. Substitui o webhook: nada fora do Supabase precisa ser configurado, so o link.
 * Mesmo padrao e mesmas credenciais de `varrer-atribuicao-meta-ads`.
 */
async function casarPeloChatwoot(supabase: SupabaseClient, janelaMin = JANELA_CHATWOOT_MIN) {
  const baseUrl = Deno.env.get('CHATWOOT_URL');
  const accountId = Deno.env.get('CHATWOOT_ACCOUNT_ID');
  const cwToken = Deno.env.get('CHATWOOT_API_TOKEN');
  const resumo = { conversas_lidas: 0, conversas_mila: 0, verificadas: 0, casadas: 0, casadas_atraso: 0, atraso_ambiguo: 0, atraso_sem_clique: 0, casadas_janela: 0, janela_ambigua: 0, sem_codigo: 0, erros: 0, pulado: null as string | null };
  if (!baseUrl || !accountId || !cwToken) { resumo.pulado = 'sem_credenciais_chatwoot'; return resumo; }

  // Sem clique esperando conversa, nenhum codigo pode casar: nem vai ao Chatwoot. E o que faz a
  // rodada de 5 min custar uma consulta ao banco nas horas em que ninguem clicou em nada.
  const corteAguardando = new Date(Date.now() - JANELA_CASAR_DIAS * 86400_000).toISOString();
  const { count: aguardando } = await supabase
    .from('rastreio_cliques')
    .select('id', { count: 'exact', head: true })
    .eq('situacao', 'aguardando')
    .gte('created_at', corteAguardando);
  if (!aguardando) { resumo.pulado = 'nenhum_clique_aguardando'; return resumo; }

  const headers = { api_access_token: cwToken, 'Content-Type': 'application/json', 'User-Agent': 'lareport-rastreador-casar/1.0' };
  const desdeSeg = Math.floor(Date.now() / 1000) - janelaMin * 60;

  // ⚠️ ATIVIDADE, nao criacao. A caixa usa `lock_to_single_conversation`: quem ja falou com a Mila
  // alguma vez volta SEMPRE para a mesma conversa. Olhar so conversa criada na janela perdia todo
  // lead que retorna (medido no teste com o numero 3325, conversa 8724 de meses atras).
  type Conv = { id: number; last_activity_at?: number; inbox_id?: number; meta?: { sender?: { phone_number?: string | null } | null } | null };
  const ativas: Conv[] = [];
  for (const inboxId of INBOXES_MILA) {
    for (let pg = 1; pg <= MAX_PAGINAS_CHATWOOT; pg++) {
      // A listagem ja vem da atividade mais recente para a mais antiga.
      const resp = await fetch(
        `${baseUrl}/api/v1/accounts/${accountId}/conversations?inbox_id=${inboxId}&status=all&assignee_type=all&page=${pg}`,
        { headers },
      );
      if (!resp.ok) throw new Error(`Chatwoot ${resp.status} ao listar conversas da caixa ${inboxId}`);
      const j = await resp.json();
      const itens: Conv[] = j?.data?.payload ?? j?.payload ?? [];
      resumo.conversas_lidas += itens.length;
      let aindaNaJanela = false;
      for (const c of itens) {
        if ((c.last_activity_at ?? 0) >= desdeSeg) { ativas.push({ ...c, inbox_id: inboxId }); aindaNaJanela = true; }
      }
      if (itens.length < 25 || !aindaNaJanela) break;
    }
  }
  resumo.conversas_mila = ativas.length;

  for (const c of ativas.slice(0, MAX_CONVERSAS_POR_RODADA)) {
    try {
      resumo.verificadas++;
      const r = await fetch(`${baseUrl}/api/v1/accounts/${accountId}/conversations/${c.id}/messages`, { headers });
      if (!r.ok) throw new Error(`mensagens da conversa ${c.id}: HTTP ${r.status}`);
      const msgs: MsgCw[] = (await r.json())?.payload ?? [];
      const telefone = String(c.meta?.sender?.phone_number ?? '');
      let achouCodigo = false;
      // So mensagens RECEBIDAS dentro da janela: o codigo vem na mensagem do clique, nao no historico.
      for (const m of msgs) {
        const recebida = m.message_type === 0 || m.message_type === 'incoming';
        if (!recebida || (m.created_at ?? 0) < desdeSeg) continue;
        const candidatos = candidatosDoTexto(m.content ?? '');
        if (candidatos.length === 0) continue;
        achouCodigo = true;
        if (!telefone) continue;
        // criadoEm = hora DA MENSAGEM (nao da conversa): o atraso clique -> mensagem tem de ser real.
        const res = await aplicarCasamento(supabase, { candidatos, telefone, conversaId: c.id, criadoEm: m.created_at ?? null });
        if (res.action === 'casado') resumo.casadas++;
      }
      if (!achouCodigo) {
        resumo.sem_codigo++;
        const unidade = UNIDADE_POR_INBOX[c.inbox_id ?? 0];
        const recebidas = msgs.filter((m) => (m.message_type === 0 || m.message_type === 'incoming') && (m.created_at ?? 0) >= desdeSeg);
        // So a mensagem que ABRE o contato (conversa calada ha 1h): evita atribuir o clique de OUTRA
        // pessoa a quem so continuou uma conversa que ja estava rolando.
        const abertura = recebidas.find((m) =>
          !msgs.some((o) => (o.message_type === 0 || o.message_type === 'incoming') && o !== m &&
            (o.created_at ?? 0) < (m.created_at ?? 0) && (o.created_at ?? 0) >= (m.created_at ?? 0) - SILENCIO_ABERTURA_SEG));
        // 2o: o ATRASO que o proprio WhatsApp registra (clique ao segundo, sobrevive ao texto apagado).
        const comAtraso = recebidas.find((m) => atrasoDaMensagem(m) !== null);
        if (comAtraso && unidade && telefone) {
          const ra = await casarPorAtraso(supabase, {
            unidade, telefone, conversaId: c.id, msgEmSeg: comAtraso.created_at ?? 0, atrasoSeg: atrasoDaMensagem(comAtraso)!,
          });
          if (ra.action === 'casado') resumo.casadas_atraso++;
          else if (ra.action === 'atraso_ambiguo') resumo.atraso_ambiguo++;
          else if (ra.action === 'atraso_sem_clique') resumo.atraso_sem_clique++;
        } else if (unidade && abertura && telefone) {
          // 3o (ultimo recurso): sem codigo e sem atraso -> unidade + proximidade de horario (provavel).
          const rj = await casarPorJanela(supabase, { unidade, telefone, conversaId: c.id, msgEmSeg: abertura.created_at ?? 0 });
          if (rj.action === 'casado') resumo.casadas_janela++;
          else if (rj.action === 'janela_ambigua') resumo.janela_ambigua++;
        }
      }
    } catch (e) {
      resumo.erros++;
      console.error('[rastreador-casar/chatwoot] conversa', c.id, e instanceof Error ? e.message : e);
    }
  }
  return resumo;
}

async function varrer(supabase: SupabaseClient, body: Record<string, any> = {}) {
  const resumo: Record<string, unknown> & { leads_resolvidos: number; ainda_sem_lead: number; sem_conversa: number; erros: number } =
    { leads_resolvidos: 0, ainda_sem_lead: 0, sem_conversa: 0, erros: 0 };

  // 0. Casa o que chegou no Chatwoot. Falha aqui NAO impede o resto da varredura.
  try {
    // `janela_min` so em chamada manual (reprocessar o que o cron perdeu); teto de 1 dia.
    const jm = Number(body?.janela_min);
    resumo.chatwoot = await casarPeloChatwoot(supabase, Number.isFinite(jm) && jm > 0 ? Math.min(jm, 1440) : JANELA_CHATWOOT_MIN);
  } catch (e) {
    resumo.erros++;
    resumo.chatwoot = { erro: e instanceof Error ? e.message : String(e) };
    console.error('[rastreador-casar/varrer] chatwoot:', e instanceof Error ? e.message : e);
  }

  // Casados cujo lead ainda nao existia quando a mensagem chegou.
  const corteLead = new Date(Date.now() - JANELA_LEAD_DIAS * 86400_000).toISOString();
  const { data: semLead, error } = await supabase
    .from('rastreio_cliques')
    .select('id, telefone_lead')
    .eq('situacao', 'casado')
    .is('lead_id', null)
    .gte('casado_em', corteLead)
    .limit(200);
  if (error) throw error;

  for (const c of semLead ?? []) {
    try {
      const leadId = await acharLead(supabase, c.telefone_lead ?? '');
      if (!leadId) { resumo.ainda_sem_lead++; continue; }
      const { error: upErr } = await supabase
        .from('rastreio_cliques')
        .update({ lead_id: leadId, updated_at: new Date().toISOString() })
        .eq('id', c.id);
      if (upErr) throw upErr;
      resumo.leads_resolvidos++;
    } catch (e) {
      resumo.erros++;
      console.error('[rastreador-casar/varrer] clique', c.id, e instanceof Error ? e.message : e);
    }
  }

  // Clique que nunca virou mensagem: pessoa que abriu o WhatsApp e nao enviou. E o normal.
  const corteConversa = new Date(Date.now() - JANELA_CASAR_DIAS * 86400_000).toISOString();
  const { data: exp, error: expErr } = await supabase
    .from('rastreio_cliques')
    .update({ situacao: 'sem_conversa', updated_at: new Date().toISOString() })
    .eq('situacao', 'aguardando')
    .lt('created_at', corteConversa)
    .select('id');
  if (expErr) console.error('[rastreador-casar/varrer] falha ao fechar cliques sem conversa:', expErr.message);
  resumo.sem_conversa = exp?.length ?? 0;

  console.log('[rastreador-casar/varrer]', JSON.stringify(resumo));
  return json({ ok: true, ...resumo });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    if (body?.varrer === true) return await varrer(supabase, body);
    return await casar(supabase, body);
  } catch (e) {
    console.error('[rastreador-casar]', e);
    return json({ ok: false, error: e instanceof Error ? e.message : 'erro interno' }, 500);
  }
});
