/// <reference lib="deno.ns" />

// Edge Function: varrer-atribuicao-meta-ads
//
// Varre periodicamente as conversas do Chatwoot criadas nos últimos N dias e grava, nos leads
// correspondentes, a atribuição de anúncio Meta (Click-to-WhatsApp): `meta_ad_source_id` (id do
// anúncio) e `meta_ctwa_clid` (id do clique).
//
// POR QUE EXISTE
// A rota em tempo real (webhook Chatwoot → n8n 5lRs2UVCB9xl0RCP → edge registrar-atribuicao-meta-ads)
// depende de a MENSAGEM trazer `content_attributes.external_ad_reply`. Isso falha em três casos
// reais e frequentes: (1) o lead apaga a mensagem de anúncio antes do processamento; (2) o lead
// escreve algo à mão em vez de mandar a mensagem pré-preenchida do anúncio; (3) a automação do
// Chatwoot que dispara o n8n não casa (foi o que produziu o buraco de 11/05 a 05/07/2026).
//
// A conversa, porém, guarda a atribuição em `additional_attributes` de forma permanente — o
// Chatwoot grava no momento da CRIAÇÃO da conversa e nada depois apaga. Esta varredura lê dali,
// então cobre os três casos acima sem depender de mensagem nenhuma.
//
// ESCOPO DE ESCRITA (deliberadamente estreito)
// Toca `leads.meta_ad_source_id`, `leads.meta_ctwa_clid` e `leads.canal_origem_id` — cada um
// só quando está VAZIO. Não empurra nada para o Emusys.
//
// Sobre `canal_origem_id`: o `upsert_lead` faz `COALESCE(v_canal_id, canal_origem_id)`, ou seja,
// só sobrescreve quando o Emusys MANDA um canal; se vier vazio, o valor daqui é preservado.
// Preencher aqui vale a pena: sem isso o lead recuperado pela varredura fica com o anúncio
// identificado mas aparece como "sem origem" no funil — medido em 01/08, 6 dos 11 leads da
// primeira execução ficaram nesse estado, contra 0/dia historicamente (o fluxo n8n em tempo real
// grava os dois). O canal vem do `source_app` da conversa; se não soubermos mapear, não escreve.
//
// FIRST-TOUCH: a trava `meta_ad_source_id IS NULL` no UPDATE garante que, se o mesmo lead clicar
// em dois anúncios ao longo do tempo, fica registrado o PRIMEIRO. A trava é aplicada na cláusula
// WHERE do próprio UPDATE, então é segura mesmo se duas execuções se cruzarem.
//
// ⚠️ Ambíguos NÃO são resolvidos aqui. Quando dois ou mais leads não-arquivados dividem o mesmo
// telefone, a varredura não escolhe — registra `ambiguo_pendente` no log para decisão humana.
// (A edge registrar-atribuicao-meta-ads, do fluxo n8n, escolhe o de contato mais recente. São
// políticas diferentes de propósito: lá é tempo real com 1 evento, aqui é lote reprocessável.)
//
// ⚠️ verify_jwt = false em supabase/config.toml, com a autenticação feita AQUI DENTRO. Isso é
// OBRIGATÓRIO para o cron: sem essa linha o gateway exige Authorization e devolve 401 antes do
// código rodar, e o pg_cron marca "succeeded" mesmo assim (só avalia se o net.http_post foi
// enfileirado). Foi exatamente assim que a sync-inadimplencia-emusys ficou 13 dias quebrada sem
// ninguém notar. O cron deste job manda x-sync-token E Authorization, por precaução.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_ADMIN_TOKEN = Deno.env.get('SYNC_MATRICULAS_ADMIN_TOKEN')?.trim() || '';

// `additional_attributes.source_app` -> canais_origem.id. Fora deste mapa não escrevemos canal:
// preferimos deixar vazio a chutar a origem.
const CANAL_POR_SOURCE_APP: Record<string, number> = {
  instagram: 1,
  facebook: 2,
};

const DIAS_PADRAO = 3;   // sobreposição generosa: um órfão é re-tentado por 3 dias antes de desistir
const DIAS_MAX = 60;     // teto para chamadas manuais de backfill
const MAX_PAGINAS = 120; // trava de segurança (120 * 25 = 3.000 conversas)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Gera variantes do telefone no formato de leads.telefone (55 + DDD + numero, só dígitos).
// Cobre: com/sem '+', sem DDI, com/sem o 9º dígito.
// ⚠️ Cópia deliberada da mesma função em registrar-atribuicao-meta-ads/index.ts. Aquela edge tem
// consumidor ativo em produção (n8n) e não precisa mudar; extrair para _shared exigiria
// redeployá-la sem ganho. Se a regra de telefone mudar, mudar NAS DUAS.
function candidatosTelefone(raw: string): string[] {
  const d = (raw || '').toString().replace(/\D/g, '');
  if (!d) return [];
  const set = new Set<string>();
  const com55 = d.startsWith('55') && d.length >= 12 ? d : (d.length >= 10 && d.length <= 11 ? '55' + d : d);
  set.add(com55);
  if (/^55\d{10}$/.test(com55)) set.add(com55.replace(/^(55\d{2})(\d{8})$/, '$19$2'));
  if (/^55(\d{2})9(\d{8})$/.test(com55)) set.add(com55.replace(/^55(\d{2})9(\d{8})$/, '55$1$2'));
  return [...set];
}

async function validarAcesso(req: Request): Promise<Response | null> {
  const syncToken = req.headers.get('x-sync-token')?.trim() || '';
  if (SYNC_ADMIN_TOKEN && syncToken && syncToken === SYNC_ADMIN_TOKEN) return null;

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ ok: false, erro: 'nao autenticado' }, 401);
  if (token === SUPABASE_SERVICE_ROLE_KEY) return null;

  const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return json({ ok: false, erro: 'token invalido' }, 401);
  return null;
}

type Conversa = {
  id?: number;
  created_at?: number;
  inbox_id?: number;
  additional_attributes?: Record<string, unknown> | null;
  contact_inbox?: { source_id?: string | null } | null;
  meta?: { sender?: { phone_number?: string | null; name?: string | null } | null } | null;
};

type LeadRow = {
  id: number;
  nome: string | null;
  unidade_id: string | null;
  telefone: string | null;
  meta_ad_source_id: string | null;
  canal_origem_id: number | null;
};

const dataUTC = (epochSeg: number) => new Date(epochSeg * 1000).toISOString().slice(0, 10);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const negado = await validarAcesso(req);
    if (negado) return negado;

    const baseUrl = Deno.env.get('CHATWOOT_URL');
    const accountId = Deno.env.get('CHATWOOT_ACCOUNT_ID');
    const cwToken = Deno.env.get('CHATWOOT_API_TOKEN');
    if (!baseUrl || !accountId || !cwToken) {
      return json({ ok: false, erro: 'Credenciais do Chatwoot ausentes (CHATWOOT_URL/CHATWOOT_ACCOUNT_ID/CHATWOOT_API_TOKEN)' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const diasBruto = Math.trunc(Number(body?.dias));
    const dias = Number.isFinite(diasBruto) && diasBruto >= 1 ? Math.min(diasBruto, DIAS_MAX) : DIAS_PADRAO;

    const agoraSeg = Math.floor(Date.now() / 1000);
    // Janela fina em epoch; o filtro da API compara DATA (UTC), então vai com 1 dia de margem
    // de cada lado para não perder as bordas.
    const desdeSeg = body?.desde ? Math.floor(Date.parse(`${body.desde}T00:00:00Z`) / 1000) : agoraSeg - dias * 86400;
    const ateSeg = body?.ate ? Math.floor(Date.parse(`${body.ate}T23:59:59Z`) / 1000) : agoraSeg;
    if (!Number.isFinite(desdeSeg) || !Number.isFinite(ateSeg) || desdeSeg >= ateSeg) {
      return json({ ok: false, erro: 'janela invalida' }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const headers = { api_access_token: cwToken, 'Content-Type': 'application/json' };

    // ── 1. Varre as conversas criadas na janela ─────────────────────────────────
    const filtro = {
      payload: [
        { attribute_key: 'created_at', filter_operator: 'is_greater_than', values: [dataUTC(desdeSeg - 86400)], query_operator: 'AND' },
        { attribute_key: 'created_at', filter_operator: 'is_less_than', values: [dataUTC(ateSeg + 86400)], query_operator: null },
      ],
    };

    const conversas: Conversa[] = [];
    let truncado = false;
    for (let pg = 1; pg <= MAX_PAGINAS; pg++) {
      const resp = await fetch(`${baseUrl}/api/v1/accounts/${accountId}/conversations/filter?page=${pg}`, {
        method: 'POST', headers, body: JSON.stringify(filtro),
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        console.error('[varrer-meta-ads] filter erro', resp.status, txt);
        return json({ ok: false, erro: `Chatwoot retornou ${resp.status} ao listar conversas` }, 502);
      }
      const data = await resp.json();
      const itens: Conversa[] = data?.payload ?? [];
      conversas.push(...itens);
      if (itens.length < 25) break;
      if (pg === MAX_PAGINAS) truncado = true;
    }

    // ── 2. Só as de anúncio, dentro da janela fina ──────────────────────────────
    type Alvo = { conversaId: number; sourceId: string; ctwaClid: string | null; sourceApp: string | null; telefone: string; candidatos: string[]; criadaEm: number };
    const alvos: Alvo[] = [];
    let semTelefone = 0;

    for (const c of conversas) {
      const criada = c.created_at ?? 0;
      if (criada < desdeSeg || criada > ateSeg) continue;

      const aa = c.additional_attributes ?? {};
      const sourceId = aa.source_id ? String(aa.source_id) : null;
      const ctwaClid = aa.ctwa_clid ? String(aa.ctwa_clid) : null;
      // Conversa de anúncio = tem id de anúncio E (marcada como 'ad' OU trouxe o clid do clique).
      // O link da bio do Instagram (click_to_chat_link, orgânico) não passa por aqui.
      const ehAnuncio = !!sourceId && (aa.source_type === 'ad' || !!ctwaClid);
      if (!ehAnuncio) continue;

      const telefone = String(c.meta?.sender?.phone_number || c.contact_inbox?.source_id || '');
      const candidatos = candidatosTelefone(telefone);
      if (candidatos.length === 0) { semTelefone++; continue; }

      alvos.push({
        conversaId: Number(c.id),
        sourceId: sourceId!,
        ctwaClid,
        sourceApp: aa.source_app ? String(aa.source_app) : null,
        telefone,
        candidatos,
        criadaEm: criada,
      });
    }

    if (alvos.length === 0) {
      return json({
        ok: true, dry_run: dryRun,
        janela: { desde: new Date(desdeSeg * 1000).toISOString(), ate: new Date(ateSeg * 1000).toISOString(), dias },
        conversas_lidas: conversas.length, conversas_anuncio: 0,
        vinculados: 0, canais_preenchidos: 0, ja_completos: 0, ambiguos: 0,
        nao_encontrados: 0, sem_telefone: semTelefone,
        truncado,
      });
    }

    // ── 3. Busca TODOS os leads candidatos numa query só ────────────────────────
    const todosCandidatos = [...new Set(alvos.flatMap(a => a.candidatos))];
    const porTelefone = new Map<string, LeadRow[]>();
    // .in() com muitos valores estoura a URL; fatia em blocos.
    for (let i = 0; i < todosCandidatos.length; i += 300) {
      const fatia = todosCandidatos.slice(i, i + 300);
      const { data, error } = await supabase
        .from('leads')
        .select('id, nome, unidade_id, telefone, meta_ad_source_id, canal_origem_id')
        .in('telefone', fatia)
        .eq('arquivado', false);
      if (error) throw error;
      for (const l of (data ?? []) as LeadRow[]) {
        const chave = l.telefone ?? '';
        if (!porTelefone.has(chave)) porTelefone.set(chave, []);
        porTelefone.get(chave)!.push(l);
      }
    }

    // ── 4. Log já existente na janela, para não repetir órfão/ambíguo todo dia ──
    const desdeLog = new Date((desdeSeg - 2 * 86400) * 1000).toISOString();
    const { data: logsAnteriores } = await supabase
      .from('leads_automacao_log')
      .select('detalhes')
      .eq('evento', 'meta_ads')
      .gte('created_at', desdeLog)
      .limit(5000);
    const jaLogado = new Set<string>();
    for (const l of (logsAnteriores ?? []) as { detalhes: Record<string, unknown> | null }[]) {
      const cid = l.detalhes?.chatwoot_conversation_id;
      const acao = l.detalhes?.acao_varredura;
      if (cid) jaLogado.add(`${cid}:${acao ?? ''}`);
    }

    // ── 4b. Mapa anúncio -> app, para as conversas que vierem sem `source_app` ──
    //
    // O WhatsApp às vezes entrega o `additional_attributes` INCOMPLETO: vem `source_id` e
    // `source_type: 'ad'`, mas sem `source_app` e sem `ctwa_clid` (visto ao vivo nas conversas
    // 18973/18979 em 04/08 — 3 chaves em vez das 5 habituais). Nesses casos o lead ganhava o
    // anúncio e ficava sem origem, e o fluxo n8n também não pegava (sem `ctwa_clid` a mensagem
    // não carrega `external_ad_reply`).
    //
    // O mesmo anúncio, porém, aparece em outras conversas COM o campo preenchido. Usamos isso:
    // a origem vem da própria Meta, para o mesmo `source_id` — não é chute nem inferência a
    // partir dos nossos dados. ⚠️ NÃO usar `leads` como fonte aqui: o anúncio 120251062759270422
    // tem 135 leads, 131 Instagram e 2 com canal diferente (preenchido por outra via), então
    // deduzir dali propagaria o erro.
    const appPorAnuncio = new Map<string, string>();
    for (const a of alvos) {
      if (a.sourceApp && !appPorAnuncio.has(a.sourceId)) appPorAnuncio.set(a.sourceId, a.sourceApp);
    }

    // ── 5. Decide e aplica ─────────────────────────────────────────────────────
    let vinculados = 0, canaisPreenchidos = 0, jaCompletos = 0, ambiguos = 0, naoEncontrados = 0;
    let appInferidos = 0;
    const pendentesRevisao: { conversa_id: number; telefone: string; lead_ids: number[] }[] = [];
    const logs: Record<string, unknown>[] = [];

    for (const a of alvos) {
      const encontrados = a.candidatos.flatMap(c => porTelefone.get(c) ?? []);
      const unicos = [...new Map(encontrados.map(l => [l.id, l])).values()];
      // App da conversa; se veio vazio, cai no app conhecido do MESMO anúncio (ver 4b).
      const appInferido = !a.sourceApp ? appPorAnuncio.get(a.sourceId) ?? null : null;
      const sourceAppEfetivo = a.sourceApp ?? appInferido;
      const canalId = sourceAppEfetivo ? CANAL_POR_SOURCE_APP[sourceAppEfetivo.toLowerCase()] ?? null : null;
      if (appInferido && canalId !== null) appInferidos++;

      // "Incompleto" = falta a atribuição OU falta o canal de origem (quando sabemos mapeá-lo).
      // O critério é esse, e não só a atribuição, porque um lead já atribuído pelo fluxo n8n
      // pode ter ficado sem canal — e vice-versa. Se olhássemos só a atribuição, esses leads
      // cairiam no ramo "já completo" e o canal nunca seria preenchido.
      const incompletos = unicos.filter(
        l => !l.meta_ad_source_id || (canalId !== null && l.canal_origem_id === null)
      );

      const detalhesBase = {
        origem: 'varredura',
        chatwoot_conversation_id: a.conversaId,
        telefone_recebido: a.telefone,
        candidatos: a.candidatos,
        source_id: a.sourceId,
        ctwa_clid: a.ctwaClid,
        source_app: a.sourceApp,
        source_app_inferido: appInferido,
        canal_origem_id: canalId,
        conversa_criada_em: new Date(a.criadaEm * 1000).toISOString(),
        matches: unicos.length,
      };

      // (a) nenhum lead com esse telefone — órfão; re-tentado enquanto estiver na janela
      if (unicos.length === 0) {
        naoEncontrados++;
        if (!jaLogado.has(`${a.conversaId}:nao_encontrado`)) {
          logs.push({
            lead_nome: '(não encontrado)', lead_id: null, unidade_nome: null,
            evento: 'meta_ads', acao: 'nao_encontrado',
            detalhes: { ...detalhesBase, acao_varredura: 'nao_encontrado' },
          });
        }
        continue;
      }

      // (b) nada faltando em nenhum lead do telefone — sem trabalho, e nada a logar
      if (incompletos.length === 0) { jaCompletos++; continue; }

      // (c) 2+ leads incompletos dividindo o telefone — a varredura NÃO escolhe
      if (incompletos.length > 1) {
        ambiguos++;
        pendentesRevisao.push({ conversa_id: a.conversaId, telefone: a.telefone, lead_ids: incompletos.map(l => l.id) });
        if (!jaLogado.has(`${a.conversaId}:ambiguo_pendente`)) {
          logs.push({
            lead_nome: incompletos.map(l => l.nome ?? '(sem nome)').join(' | '),
            lead_id: null, unidade_nome: null,
            evento: 'meta_ads', acao: 'ambiguo_pendente',
            detalhes: { ...detalhesBase, acao_varredura: 'ambiguo_pendente', lead_ids: incompletos.map(l => l.id) },
          });
        }
        continue;
      }

      // (d) exatamente 1 lead incompleto — preenche o que falta nele
      const alvo = incompletos[0];
      const gravaAtribuicao = !alvo.meta_ad_source_id;
      const gravaCanal = canalId !== null && alvo.canal_origem_id === null;

      if (dryRun) {
        if (gravaAtribuicao) vinculados++;
        if (gravaCanal) canaisPreenchidos++;
        continue;
      }

      let mexeu = false;

      // Atribuição do anúncio. A trava IS NULL fica no WHERE do UPDATE (first-touch, segura
      // mesmo com duas execuções cruzadas). 0 linhas = outra execução chegou antes.
      if (gravaAtribuicao) {
        const { data: upd, error: upErr } = await supabase
          .from('leads')
          .update({ meta_ad_source_id: a.sourceId, meta_ctwa_clid: a.ctwaClid })
          .eq('id', alvo.id)
          .is('meta_ad_source_id', null)
          .select('id');
        if (upErr) throw upErr;
        if (upd && upd.length > 0) { vinculados++; mexeu = true; }
      }

      // Canal de origem, em UPDATE separado: as duas travas IS NULL são independentes, e num
      // update só a que já estivesse preenchida bloquearia a gravação da outra.
      if (gravaCanal) {
        const { data: upd, error: canalErr } = await supabase
          .from('leads')
          .update({ canal_origem_id: canalId })
          .eq('id', alvo.id)
          .is('canal_origem_id', null)
          .select('id');
        if (canalErr) throw canalErr;
        if (upd && upd.length > 0) { canaisPreenchidos++; mexeu = true; }
      }

      if (!mexeu) { jaCompletos++; continue; }

      logs.push({
        lead_nome: alvo.nome ?? '(sem nome)', lead_id: alvo.id, unidade_nome: alvo.unidade_id,
        evento: 'meta_ads', acao: gravaAtribuicao ? 'vinculado' : 'canal_preenchido',
        detalhes: {
          ...detalhesBase,
          acao_varredura: gravaAtribuicao ? 'vinculado' : 'canal_preenchido',
          gravou_atribuicao: gravaAtribuicao,
          gravou_canal: gravaCanal,
        },
      });
    }

    if (!dryRun && logs.length > 0) {
      const { error: logErr } = await supabase.from('leads_automacao_log').insert(logs);
      if (logErr) console.error('[varrer-meta-ads] falha ao gravar log (dado principal já gravado):', logErr);
    }

    const resumo = {
      ok: true,
      dry_run: dryRun,
      janela: { desde: new Date(desdeSeg * 1000).toISOString(), ate: new Date(ateSeg * 1000).toISOString(), dias },
      conversas_lidas: conversas.length,
      conversas_anuncio: alvos.length,
      vinculados,
      canais_preenchidos: canaisPreenchidos,
      canais_por_app_inferido: appInferidos,
      ja_completos: jaCompletos,
      ambiguos,
      nao_encontrados: naoEncontrados,
      sem_telefone: semTelefone,
      pendentes_revisao: pendentesRevisao,
      truncado,
    };
    console.log('[varrer-meta-ads]', JSON.stringify({ ...resumo, pendentes_revisao: pendentesRevisao.length }));
    return json(resumo);
  } catch (e) {
    console.error('[varrer-atribuicao-meta-ads]', e);
    return json({ ok: false, erro: e instanceof Error ? e.message : 'erro interno' }, 500);
  }
});
