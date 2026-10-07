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
// Toca `leads.meta_ad_source_id` e `leads.meta_ctwa_clid` direto no LA Report, cada um só quando
// está VAZIO — o Emusys não tem campo para eles.
//
// ORIGEM (canal) VAI PELO EMUSYS desde a v25 (05/10/2026, decisão do Hugo, FISC-85): a varredura
// NÃO grava mais `canal_origem_id`. Ela faz PATCH do "Como conheceu" no Emusys
// (`/crm/leads/por_telefone`, só `numero` + `como_conheceu_id`), o Emusys dispara o webhook de lead
// editado e o `upsert_lead` grava o canal — o mesmo caminho do curso preenchido pelo Jev. Assim
// Emusys e LA Report contam a mesma origem.
//
// ⚠️ NÃO ATROPELAR (regra do Hugo): a varredura é a ÚLTIMA rede, só tapa buraco. Já marcam origem,
// antes dela: o n8n 5lRs2UVCB9xl0RCP (grava no Emusys ~2 min após a mensagem pronta do anúncio), a
// Mila (pergunta "como conheceu") e o consultor (palavra final). Por isso só envia quando TUDO vale:
//   1. a conversa tem prova de anúncio e o app tem opção mapeada;
//   2. o lead está sem canal no LA Report E nenhum webhook do Emusys trouxe origem para ele
//      (`leads_automacao_log` evento 'emusys' com `detalhes.canal` preenchido) — cobre a opção do
//      Emusys que não tem canal no LA Report, como "INDICAÇÃO ALUNO" da Barra;
//   3. a conversa tem pelo menos ESPERA_ORIGEM_MIN minutos (dá tempo aos mecanismos acima).
// Nunca troca origem preenchida. Cada envio/falha fica em `leads_automacao_log` (evento meta_ads).
//
// STATUS DO WHATSAPP (source_app = 'whatsapp'): é o anúncio do Instagram exibido no Status do
// WhatsApp, sempre sem `ctwa_clid` e sem a mensagem pronta — o n8n nunca dispara para ele (0 de 7
// na semana de 28/09). Vai para a opção "STATUS DO WHATSAPP" do Emusys (canal 13) e a conversa
// ganha a etiqueta `status-whatsapp` no Chatwoot (merge: o POST /labels SUBSTITUI a lista).
// ⚠️ Nunca mandar a opção "WHATSAPP" (26): o `upsert_lead` a traduz para Facebook.
//
// v26 (05/10/2026): telefone que é lead em mais de uma unidade desempata pela CAIXA de entrada
// da conversa (`UNIDADE_POR_INBOX`), e o detalhe do log guarda `desempate_pela_caixa`.
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
import { autorizarEquipe } from '../_shared/equipeAuthorization.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_ADMIN_TOKEN = Deno.env.get('SYNC_MATRICULAS_ADMIN_TOKEN')?.trim() || '';

// `additional_attributes.source_app` -> canais_origem.id. Fora deste mapa não enviamos origem:
// preferimos deixar vazio a chutar.
const CANAL_POR_SOURCE_APP: Record<string, number> = {
  instagram: 1,
  facebook: 2,
  whatsapp: 13, // "Status do WhatsApp"
};

// Opção "Como conheceu" do Emusys para cada app. O `upsert_lead` traduz o nome de volta no canal
// acima (INSTAGRAM->Instagram, FACEBOOK->Facebook, STATUS DO WHATSAPP->Status do WhatsApp).
// ⚠️ O id é resolvido por NOME, por unidade, a cada execução: não é igual entre unidades
// (STATUS DO WHATSAPP é 36 na Barra e 33 em CG e Recreio).
const OPCAO_EMUSYS_POR_APP: Record<string, string> = {
  instagram: 'INSTAGRAM',
  facebook: 'FACEBOOK',
  whatsapp: 'STATUS DO WHATSAPP',
};

const UNIDADES_EMUSYS: Record<string, { nome: string; tokenEnv: string }> = {
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': { nome: 'Campo Grande', tokenEnv: 'EMUSYS_TOKEN_CG' },
  '95553e96-971b-4590-a6eb-0201d013c14d': { nome: 'Recreio', tokenEnv: 'EMUSYS_TOKEN_RECREIO' },
  '368d47f5-2d88-4475-bc14-ba084a9a348e': { nome: 'Barra', tokenEnv: 'EMUSYS_TOKEN_BARRA' },
};

// Caixa de entrada do Chatwoot -> unidade. Desempata o telefone que é lead em mais de uma
// unidade (v26, 05/10/2026): medido, as 23 conversas "ambíguas" de 65 dias eram TODAS o mesmo
// telefone em unidades diferentes. Caixa fora do mapa (ex.: ADM Recreio) mantém o comportamento
// antigo: 2+ leads = não escolhe.
const UNIDADE_POR_INBOX: Record<number, string> = {
  155: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', // Mila_CG
  180: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', // LA_Secretaria_CG
  148: '95553e96-971b-4590-a6eb-0201d013c14d', // Mila_Recreio
  168: '95553e96-971b-4590-a6eb-0201d013c14d', // LA_Secretaria_Recreio
  147: '368d47f5-2d88-4475-bc14-ba084a9a348e', // Mila_Barra
  179: '368d47f5-2d88-4475-bc14-ba084a9a348e', // LA_secretaria_Barra
};

const EMUSYS_API = 'https://api.emusys.com.br/v1';
const ESPERA_ORIGEM_MIN = 60; // tempo dado ao n8n, à Mila e ao consultor antes de a varredura agir
const ETIQUETA_STATUS = 'status-whatsapp';

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

// O Emusys espera DDD + número, sem o 55.
function numeroEmusys(tel: string | null): string {
  const d = (tel || '').replace(/\D/g, '');
  return d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
}

// Header `token` em minúsculas: o Emusys lê o nome exato (com `Token` responde "token invalido!").
async function emusysReq(metodo: string, caminho: string, token: string, corpo?: unknown): Promise<unknown> {
  const resp = await fetch(EMUSYS_API + caminho, {
    method: metodo,
    headers: {
      token,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'lareport-varrer-atribuicao-meta-ads/26',
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const txt = await resp.text();
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${metodo} ${caminho}: ${txt.slice(0, 300)}`);
  try {
    return txt ? JSON.parse(txt) : null;
  } catch {
    throw new Error(`resposta não é JSON em ${metodo} ${caminho}: ${txt.slice(0, 200)}`);
  }
}

// 25/09/2026: ate aqui bastava QUALQUER usuario logado (verify_jwt=false no gateway e a
// chave anon e publica) — um professor autenticado disparava a varredura que grava em
// leads.meta_ad_source_id/meta_ctwa_clid. Agora exige usuario ATIVO com perfil
// admin/unidade, no mesmo padrao de enviar-mensagem-admin. Cron (x-sync-token) e
// service_role seguem.
async function validarAcesso(req: Request): Promise<Response | null> {
  const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const resultado = await autorizarEquipe(req, {
    syncAdminToken: SYNC_ADMIN_TOKEN,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    getUser: async (token) => {
      const { data, error } = await authClient.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    buscarUsuario: async (authUserId) => {
      const { data } = await authClient
        .from('usuarios')
        .select('perfil, ativo')
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      return data;
    },
  });
  if (resultado.ok === false) {
    return json({ ok: false, erro: resultado.erro }, resultado.status);
  }
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
    type Alvo = { conversaId: number; inboxId: number | null; sourceId: string; ctwaClid: string | null; sourceApp: string | null; telefone: string; candidatos: string[]; criadaEm: number };
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
        inboxId: typeof c.inbox_id === 'number' ? c.inbox_id : null,
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
        versao: 26, vinculados: 0, ja_completos: 0, ambiguos: 0,
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

    // ── 4c. Quem já recebeu origem pelo Emusys (regra "não atropelar") ─────────
    //
    // Canal vazio no LA Report não prova que o Emusys esteja vazio: o consultor pode ter marcado
    // uma opção sem canal correspondente aqui (ex.: "INDICAÇÃO ALUNO" da Barra), e o `upsert_lead`
    // então mantém o canal vazio. O log de cada webhook guarda o nome recebido em `detalhes.canal`.
    const idsSemCanal = [...new Set([...porTelefone.values()].flat().filter(l => l.canal_origem_id === null).map(l => l.id))];
    const origemNoEmusys = new Set<number>();
    // ⚠️ O PostgREST corta em 1.000 linhas SEM avisar. Corte aqui = lead com origem no Emusys
    // tratado como vazio = atropelar o consultor. Por isso o filtro vai no banco, o lote é pequeno
    // e bater no teto derruba a rodada em vez de seguir com a lista incompleta.
    for (let i = 0; i < idsSemCanal.length; i += 25) {
      const { data, error } = await supabase
        .from('leads_automacao_log')
        .select('lead_id, canal:detalhes->>canal')
        .eq('evento', 'emusys')
        .in('lead_id', idsSemCanal.slice(i, i + 25))
        .not('detalhes->>canal', 'is', null)
        .neq('detalhes->>canal', '')
        .limit(1000);
      if (error) throw error;
      if ((data ?? []).length >= 1000) throw new Error(`origem no Emusys: lote ${i} bateu 1.000 linhas, lista incompleta`);
      for (const r of (data ?? []) as { lead_id: number; canal: string | null }[]) {
        if (String(r.canal ?? '').trim()) origemNoEmusys.add(r.lead_id);
      }
    }

    // Opções "Como conheceu" por unidade, lidas uma vez por execução e só se forem necessárias.
    const opcoesPorUnidade = new Map<string, Map<string, number>>();
    async function idOpcaoEmusys(unidadeId: string, nomeOpcao: string): Promise<number> {
      const u = UNIDADES_EMUSYS[unidadeId];
      const token = Deno.env.get(u.tokenEnv)?.trim();
      if (!token) throw new Error(`segredo ${u.tokenEnv} ausente`);
      if (!opcoesPorUnidade.has(unidadeId)) {
        const r = await emusysReq('GET', '/crm/opcoes_como_conheceu', token) as { como_conheceu_opcoes?: { id: number; nome: string }[] } | null;
        const lista = r?.como_conheceu_opcoes;
        if (!Array.isArray(lista)) throw new Error(`opcoes_como_conheceu sem lista em ${u.nome}`);
        opcoesPorUnidade.set(unidadeId, new Map(lista.map(o => [String(o.nome).trim().toUpperCase(), Number(o.id)])));
      }
      const id = opcoesPorUnidade.get(unidadeId)!.get(nomeOpcao);
      if (!id) throw new Error(`opção "${nomeOpcao}" não existe no Emusys de ${u.nome}`);
      return id;
    }

    // ── 5. Decide e aplica ─────────────────────────────────────────────────────
    let vinculados = 0, jaCompletos = 0, ambiguos = 0, naoEncontrados = 0;
    let appInferidos = 0, desempatesPelaCaixa = 0;
    let origensEnviadas = 0, origensFalhas = 0, origensAguardando = 0, origensEmusysJaTinha = 0, origensJaEnviadas = 0, origensSemUnidade = 0;
    const pendentesRevisao: { conversa_id: number; telefone: string; lead_ids: number[] }[] = [];
    const planejado: Record<string, unknown>[] = [];
    const tocados: { lead_id: number; acao: string }[] = [];
    const logs: Record<string, unknown>[] = [];
    const conversasStatus: number[] = [];

    for (const a of alvos) {
      const encontrados = a.candidatos.flatMap(c => porTelefone.get(c) ?? []);
      const todosDoTelefone = [...new Map(encontrados.map(l => [l.id, l])).values()];
      // Mesmo telefone em 2+ unidades: fica só o lead da unidade da caixa onde a conversa entrou.
      // Sem isso a varredura recusava (ambíguo) ou, quando só o lead da OUTRA unidade estava
      // incompleto, gravava o anúncio no cadastro errado.
      const unidadeDaCaixa = a.inboxId != null ? UNIDADE_POR_INBOX[a.inboxId] ?? null : null;
      const daUnidade = unidadeDaCaixa ? todosDoTelefone.filter(l => l.unidade_id === unidadeDaCaixa) : [];
      const desempatouPelaCaixa = todosDoTelefone.length > 1 && daUnidade.length >= 1 && daUnidade.length < todosDoTelefone.length;
      const unicos = desempatouPelaCaixa ? daUnidade : todosDoTelefone;
      // App da conversa; se veio vazio, cai no app conhecido do MESMO anúncio (ver 4b).
      const appInferido = !a.sourceApp ? appPorAnuncio.get(a.sourceId) ?? null : null;
      const sourceAppEfetivo = (a.sourceApp ?? appInferido)?.toLowerCase() ?? null;
      const canalId = sourceAppEfetivo ? CANAL_POR_SOURCE_APP[sourceAppEfetivo] ?? null : null;
      if (appInferido && canalId !== null) appInferidos++;
      if (sourceAppEfetivo === 'whatsapp') conversasStatus.push(a.conversaId);
      if (desempatouPelaCaixa) desempatesPelaCaixa++;

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
        inbox_id: a.inboxId,
        desempate_pela_caixa: desempatouPelaCaixa ? { leads_do_telefone: todosDoTelefone.map(l => l.id), ficou: unicos.map(l => l.id) } : null,
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
      const faltaCanal = canalId !== null && alvo.canal_origem_id === null;
      const opcaoEmusys = sourceAppEfetivo ? OPCAO_EMUSYS_POR_APP[sourceAppEfetivo] ?? null : null;

      // Decisão da origem — cada motivo de NÃO enviar é contado e devolvido (carimbo).
      let decisaoOrigem: string | null = null;
      if (faltaCanal) {
        const idadeMin = (agoraSeg - a.criadaEm) / 60;
        if (!opcaoEmusys) decisaoOrigem = 'sem_opcao_emusys';
        else if (origemNoEmusys.has(alvo.id)) decisaoOrigem = 'emusys_ja_tem_origem';
        else if (jaLogado.has(`${a.conversaId}:origem_enviada_emusys`)) decisaoOrigem = 'ja_enviada_aguardando_webhook';
        else if (idadeMin < ESPERA_ORIGEM_MIN) decisaoOrigem = 'aguardando_outros_mecanismos';
        else if (!alvo.unidade_id || !UNIDADES_EMUSYS[alvo.unidade_id]) decisaoOrigem = 'unidade_sem_emusys';
        else decisaoOrigem = 'enviar';
      }
      if (decisaoOrigem === 'emusys_ja_tem_origem') origensEmusysJaTinha++;
      if (decisaoOrigem === 'ja_enviada_aguardando_webhook') origensJaEnviadas++;
      if (decisaoOrigem === 'aguardando_outros_mecanismos') origensAguardando++;
      if (decisaoOrigem === 'unidade_sem_emusys' || decisaoOrigem === 'sem_opcao_emusys') origensSemUnidade++;

      if (dryRun) {
        if (gravaAtribuicao) vinculados++;
        let opcaoId: number | string | null = null;
        if (decisaoOrigem === 'enviar') {
          // Leitura só (GET): mostra o id que seria enviado, e já denuncia opção faltando.
          try { opcaoId = await idOpcaoEmusys(alvo.unidade_id!, opcaoEmusys!); } catch (e) { opcaoId = `ERRO: ${e instanceof Error ? e.message : e}`; }
        }
        planejado.push({
          lead_id: alvo.id, nome: alvo.nome, unidade: alvo.unidade_id ? UNIDADES_EMUSYS[alvo.unidade_id]?.nome ?? alvo.unidade_id : null,
          conversa_id: a.conversaId, app: sourceAppEfetivo, app_inferido: !!appInferido,
          grava_atribuicao: gravaAtribuicao, origem: decisaoOrigem, opcao_emusys: opcaoEmusys, opcao_id: opcaoId,
          desempate_pela_caixa: desempatouPelaCaixa ? todosDoTelefone.map(l => l.id) : null,
        });
        continue;
      }

      // Atribuição do anúncio. A trava IS NULL fica no WHERE do UPDATE (first-touch, segura
      // mesmo com duas execuções cruzadas). 0 linhas = outra execução chegou antes.
      let vinculouAgora = false;
      if (gravaAtribuicao) {
        const { data: upd, error: upErr } = await supabase
          .from('leads')
          .update({ meta_ad_source_id: a.sourceId, meta_ctwa_clid: a.ctwaClid })
          .eq('id', alvo.id)
          .is('meta_ad_source_id', null)
          .select('id');
        if (upErr) throw upErr;
        if (upd && upd.length > 0) { vinculados++; vinculouAgora = true; }
      }
      if (vinculouAgora) {
        tocados.push({ lead_id: alvo.id, acao: 'vinculado' });
        logs.push({
          lead_nome: alvo.nome ?? '(sem nome)', lead_id: alvo.id, unidade_nome: alvo.unidade_id,
          evento: 'meta_ads', acao: 'vinculado',
          detalhes: { ...detalhesBase, acao_varredura: 'vinculado', gravou_atribuicao: true, decisao_origem: decisaoOrigem },
        });
      }

      // Origem pelo Emusys. Falha NÃO derruba a varredura: fica no log com o erro original e a
      // próxima rodada (de hora em hora, por DIAS_PADRAO dias) tenta de novo.
      if (decisaoOrigem === 'enviar') {
        try {
          const opcaoId = await idOpcaoEmusys(alvo.unidade_id!, opcaoEmusys!);
          const token = Deno.env.get(UNIDADES_EMUSYS[alvo.unidade_id!].tokenEnv)!.trim();
          const r = await emusysReq('PATCH', '/crm/leads/por_telefone', token, {
            numero: numeroEmusys(alvo.telefone), como_conheceu_id: opcaoId,
          }) as { status?: number } | null;
          if (!r || r.status !== 200) throw new Error(`resposta inesperada do PATCH: ${JSON.stringify(r).slice(0, 200)}`);
          origensEnviadas++;
          tocados.push({ lead_id: alvo.id, acao: 'origem_enviada_emusys' });
          logs.push({
            lead_nome: alvo.nome ?? '(sem nome)', lead_id: alvo.id, unidade_nome: alvo.unidade_id,
            evento: 'meta_ads', acao: 'origem_enviada_emusys',
            detalhes: { ...detalhesBase, acao_varredura: 'origem_enviada_emusys', opcao_emusys: opcaoEmusys, opcao_id: opcaoId },
          });
        } catch (e) {
          origensFalhas++;
          const erro = e instanceof Error ? e.message : String(e);
          console.error(`[varrer-meta-ads] lead ${alvo.id} (conversa ${a.conversaId}): origem não enviada ao Emusys: ${erro}`);
          logs.push({
            lead_nome: alvo.nome ?? '(sem nome)', lead_id: alvo.id, unidade_nome: alvo.unidade_id,
            evento: 'meta_ads', acao: 'origem_falhou_emusys',
            detalhes: { ...detalhesBase, acao_varredura: 'origem_falhou_emusys', opcao_emusys: opcaoEmusys, erro },
          });
        }
      }

      if (!vinculouAgora && decisaoOrigem !== 'enviar') jaCompletos++;
    }

    // ── 6. Etiqueta `status-whatsapp` nas conversas do Status (merge, nunca substitui) ──
    let etiquetasStatus = 0, etiquetasJaTinham = 0;
    const etiquetasFalhas: { conversa_id: number; erro: string }[] = [];
    const etiquetadas: number[] = [];
    for (const cid of [...new Set(conversasStatus)]) {
      if (dryRun) { etiquetasStatus++; continue; }
      try {
        const urlLabels = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${cid}/labels`;
        const g = await fetch(urlLabels, { headers });
        if (!g.ok) throw new Error(`GET labels ${g.status}: ${(await g.text().catch(() => '')).slice(0, 200)}`);
        const atuais: string[] = ((await g.json())?.payload ?? []).map((x: unknown) => String(x));
        if (atuais.includes(ETIQUETA_STATUS)) { etiquetasJaTinham++; continue; }
        const p = await fetch(urlLabels, { method: 'POST', headers, body: JSON.stringify({ labels: [...atuais, ETIQUETA_STATUS] }) });
        if (!p.ok) throw new Error(`POST labels ${p.status}: ${(await p.text().catch(() => '')).slice(0, 200)}`);
        etiquetasStatus++;
        etiquetadas.push(cid);
      } catch (e) {
        const erro = e instanceof Error ? e.message : String(e);
        console.error(`[varrer-meta-ads] conversa ${cid}: etiqueta ${ETIQUETA_STATUS} não gravada: ${erro}`);
        etiquetasFalhas.push({ conversa_id: cid, erro });
        if (!jaLogado.has(`${cid}:etiqueta_falhou`)) {
          logs.push({
            lead_nome: '(conversa)', lead_id: null, unidade_nome: null,
            evento: 'meta_ads', acao: 'etiqueta_falhou',
            detalhes: { origem: 'varredura', chatwoot_conversation_id: cid, acao_varredura: 'etiqueta_falhou', etiqueta: ETIQUETA_STATUS, erro },
          });
        }
      }
    }

    if (!dryRun && logs.length > 0) {
      const { error: logErr } = await supabase.from('leads_automacao_log').insert(logs);
      if (logErr) console.error('[varrer-meta-ads] falha ao gravar log (dado principal já gravado):', logErr);
    }

    const resumo = {
      ok: true,
      versao: 26,
      dry_run: dryRun,
      janela: { desde: new Date(desdeSeg * 1000).toISOString(), ate: new Date(ateSeg * 1000).toISOString(), dias },
      conversas_lidas: conversas.length,
      conversas_anuncio: alvos.length,
      vinculados,
      canais_por_app_inferido: appInferidos,
      desempates_pela_caixa: desempatesPelaCaixa,
      origens: {
        enviadas_emusys: origensEnviadas,
        falhas: origensFalhas,
        emusys_ja_tinha: origensEmusysJaTinha,
        ja_enviadas_aguardando_webhook: origensJaEnviadas,
        aguardando_outros_mecanismos: origensAguardando,
        sem_unidade_ou_opcao: origensSemUnidade,
      },
      etiqueta_status: { gravadas: etiquetasStatus, ja_tinham: etiquetasJaTinham, falhas: etiquetasFalhas, conversas: etiquetadas },
      ja_completos: jaCompletos,
      ambiguos,
      nao_encontrados: naoEncontrados,
      sem_telefone: semTelefone,
      pendentes_revisao: pendentesRevisao,
      tocados,
      ...(dryRun ? { planejado } : {}),
      truncado,
    };
    console.log('[varrer-meta-ads]', JSON.stringify({ ...resumo, pendentes_revisao: pendentesRevisao.length, planejado: planejado.length }));
    return json(resumo);
  } catch (e) {
    console.error('[varrer-atribuicao-meta-ads]', e);
    return json({ ok: false, erro: e instanceof Error ? e.message : 'erro interno' }, 500);
  }
});
