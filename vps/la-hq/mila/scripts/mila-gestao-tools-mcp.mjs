#!/usr/bin/env node
/**
 * mila-gestao-tools — MCP server (stdio) da MILA DE GESTÃO (time comercial).
 *
 * Padrão "crachá" (igual ao mila-sdr-tools): este processo segura o segredo e
 * chama as RPCs do LA Report; o agente só invoca a tool, nunca vê chave nenhuma.
 *
 * Padrão "carimbo" (igual ao MILA_UNIDADE do SDR): QUEM PEDE vem da env
 * MILA_SOLICITANTE_TELEFONE, fixada por instância — NUNCA de argumento da tool.
 * O gateway do Hermes não entrega o remetente às tools (só session ids), então
 * o modelo não pode "escolher" ser outra pessoa. Toda RPC recebe esse telefone
 * e escopa por `governanca.quem_eh`: consultora só vê a própria unidade;
 * diretoria (unidade nula) vê tudo. "Ela não vaza informação das outras
 * unidades" (Luciano, 04/09) — garantido aqui e no banco, não no prompt.
 *
 * Régua (Luciano): NÚMERO vem de RPC; o modelo interpreta e redige. Nenhuma
 * tool aqui aceita SQL. Escrita: uma tool nomeada e estreita por intenção,
 * validada e com trilha no banco. NUNCA deleta. Não escreve valor, converteu
 * nem status de matrícula (é do Emusys / da Sol).
 *
 * Tráfego/investimento (bloco 5) é dado de diretoria: as tools só são LISTADAS
 * quando `quem_eh` diz diretoria/lider/marketing. Resolvido uma vez no start.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const URL_ = (process.env.SUPABASE_LAREPORT_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_LAREPORT_SERVICE_KEY || '';
const TEL = (process.env.MILA_SOLICITANTE_TELEFONE || '').replace(/\D/g, '');
const DRY = process.env.MILA_GESTAO_DRY_RUN === '1';

function log(o) { try { console.error(JSON.stringify({ ts: new Date().toISOString(), ...o })); } catch {} }

async function rpc(fn, args) {
  if (!URL_ || !KEY) throw new Error('lareport_nao_configurado');
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`rpc_${fn}_${res.status}: ${raw.slice(0, 300)}`);
  return raw ? JSON.parse(raw) : null;
}

// quem é o carimbo — decide quais tools existem
let QUEM = null;
async function resolverQuem() {
  if (!TEL) { log({ aviso: 'MILA_SOLICITANTE_TELEFONE vazio — nenhuma tool sera oferecida' }); return null; }
  // `governanca.quem_eh` vive fora de `public` (PostgREST só expõe `public`);
  // `mila_quem_sou_v1` é o wrapper público, só leitura.
  try {
    const r = await rpc('mila_quem_sou_v1', { p_telefone: TEL });
    QUEM = r && r.ok ? r : null;
  } catch (e) { log({ erro: 'nao_resolveu_quem', msg: String(e.message) }); QUEM = null; }
  log({ carimbo: TEL ? TEL.slice(0, 4) + '…' : null, quem: QUEM && QUEM.nome, escopo: QUEM && (QUEM.escopo || QUEM.departamento) });
  return QUEM;
}
const veTudo = () => !!QUEM && (QUEM.escopo === 'todas' || ['diretoria', 'lider', 'marketing'].includes(String(QUEM.departamento || '').toLowerCase()));

// ── tools de LEITURA ─────────────────────────────────────────────────────────
const LEITURA = [
  { name: 'minha_pauta',
    description: 'O que precisa de ação HOJE na(s) unidade(s) de quem pergunta: sinais abertos do radar comercial (lead sem desfecho, faltou sem remarcar, preso no bot, promessa da escola sem retorno), até 30 dias, já ordenados. Use quando perguntarem "o que tenho pra hoje", "tem pendência?", "quem eu ligo primeiro?".',
    inputSchema: { type: 'object', properties: { limite: { type: 'integer', description: 'Quantos itens (padrão 6, máx 20).' } } } },
  { name: 'estrelas_matriculador',
    description: 'Situação do programa MATRICULADOR + LA (as 5 estrelas do mês) para a unidade de quem pergunta: matrículas x meta, show-up, ticket, indicação, Hunter 360 — com quanto FALTA em cada uma. Use para incentivar e para responder "como tô no programa?". Números medidos; max_indicacao é PISO (diga isso).',
    inputSchema: { type: 'object', properties: { ano: { type: 'integer' }, mes: { type: 'integer' } } } },
  { name: 'ficha_lead',
    description: 'Tudo sobre UM contato numa chamada: etapa, dias parado, experimentais (feitas/faltou/canceladas), professor, canal, anúncio, calor da conversa (chegou a humano? quantas mensagens?), sinais abertos e o que já foi registrado. Busque por telefone OU nome OU lead_id. Se voltar `ambiguo`, PERGUNTE qual — nunca escolha. Só devolve lead da unidade de quem pergunta.',
    inputSchema: { type: 'object', properties: { telefone: { type: 'string' }, nome: { type: 'string' }, lead_id: { type: 'integer' } } } },
  { name: 'agenda_do_dia',
    description: 'A AGENDA da unidade de quem pergunta num dia: TODAS as experimentais do dia com a situacao de cada uma (agendada/realizada/faltou/cancelada) + visitas (hora, aluno, curso, professor, telefone), o que ficou de ontem sem desfecho, quem faltou e ainda da pra remarcar, quem esta quente agora e a estrela mais perto. Use para "quais as experimentais de hoje?", "o que tenho na agenda?", "quem vem amanha?" — NAO use minha_pauta para isso: pauta e o que precisa de acao, agenda e quem tem aula marcada. `data` YYYY-MM-DD (padrao hoje).',
    inputSchema: { type: 'object', properties: { data: { type: 'string', description: 'YYYY-MM-DD (padrao: hoje).' } } } },
  { name: 'fechamento_do_dia',
    description: 'Como FOI o dia na unidade de quem pergunta: experimentais realizadas e o desfecho de cada uma, faltas (remarcada? teto de 3 tentativas?), matriculas do dia, quem e de dias anteriores e segue sem desfecho, e o que ja esta marcado para o proximo dia util. Use para "como foi o dia?", "quantas experimentais teve hoje?", "quem matriculou hoje?". `data` YYYY-MM-DD (padrao hoje).',
    inputSchema: { type: 'object', properties: { data: { type: 'string', description: 'YYYY-MM-DD (padrao: hoje).' } } } },
  { name: 'pendencias_comerciais',
    description: 'As 5 pendências cadastrais da unidade: matriculado sem anamnese, experimental realizada sem ficha, lead sem canal de origem, lead sem curso de interesse, experimental feita sem desfecho — com total, amostra e a ação. Use para "tem pendência cadastral?", "quem está sem anamnese?". Cada uma delas você pode RESOLVER com as tools de registrar_*.',
    inputSchema: { type: 'object', properties: { amostra: { type: 'integer', description: 'Itens por bucket (padrão 8).' } } } },
];
const TRAFEGO = [
  { name: 'trafego_por_canal',
    description: 'DIRETORIA. Desempenho por canal (Instagram, Google, Indicação, Visita...): leads, agendamentos, matrículas, gasto, custo por lead e por matrícula, retorno em LTV. `gasto` NULL com gasto_dias_cobertos=0 = NÃO SEI (nunca "de graça"). Canal orgânico não tem mídia — diga "sem mídia", não "custo zero". Use p_dias=30/p_maturidade=0 para o mês corrente (imaturo) e 180/35 para coorte madura.',
    inputSchema: { type: 'object', properties: { dias: { type: 'integer' }, maturidade_dias: { type: 'integer' } } } },
  { name: 'trafego_por_criativo',
    description: 'DIRETORIA. Funil por criativo do Meta: gasto → conversa → lead → AGENDAMENTO → experimental → matrícula. Ranqueie por custo de AGENDAMENTO, não por custo de conversa (é o que inverte o ranking). Se cohort_madura=false, avise que o número ainda vai mudar.',
    inputSchema: { type: 'object', properties: { de: { type: 'string', description: 'YYYY-MM-DD' }, ate: { type: 'string' } } } },
  { name: 'publicos_reativacao',
    description: 'DIRETORIA/GESTÃO. Tamanho dos públicos prontos para reativação (fez experimental e não matriculou, faltou e nunca remarcou, famílias ativas p/ indicação, ex-alunos, frios). Devolve TAMANHO, nunca telefone.',
    inputSchema: { type: 'object', properties: {} } },
];
// ── tools de ESCRITA (uma por intenção; validadas e com trilha no banco) ─────
const ESCRITA = [
  { name: 'registrar_curso_interesse',
    description: 'ESCREVE. Registra/corrige o instrumento de interesse do lead ("o curso dele é bateria"). Aceita nome parcial; se ambíguo (ex.: "flauta"), devolve candidatos — pergunte. Sobrescreve o anterior (mudar de instrumento é decisão humana). Fica com trilha de quem pediu.',
    inputSchema: { type: 'object', required: ['lead_id', 'curso'], properties: { lead_id: { type: 'integer' }, curso: { type: 'string' } } } },
  { name: 'registrar_motivo_perda',
    description: 'ESCREVE. Registra POR QUE o lead não fechou (preço, horário, distância, vai pensar, preferiu outra escola, não gostou, desistiu, financeiro, sem tempo, outro) + nota livre. NÃO muda status nem matrícula — só o motivo. Use quando a consultora disser "ele não vai fechar porque X".',
    inputSchema: { type: 'object', required: ['lead_id', 'motivo'], properties: { lead_id: { type: 'integer' }, motivo: { type: 'string' }, nota: { type: 'string' } } } },
  { name: 'registrar_canal_origem',
    description: 'ESCREVE. Registra de onde o lead veio (Instagram, Google, Indicação, Visita/Placa, Ex-aluno, Family, Convênios, Site, Ligação, Outros). É FIRST-TOUCH: se já tem canal, recusa e mostra o atual — só sobrescreva com sobrescrever=true depois de CONFIRMAR com a pessoa.',
    inputSchema: { type: 'object', required: ['lead_id', 'canal'], properties: { lead_id: { type: 'integer' }, canal: { type: 'string' }, sobrescrever: { type: 'boolean' } } } },
  { name: 'fechar_sinal',
    description: 'ESCREVE. Fecha um item da pauta quando a consultora diz "já resolvi" / "ele não quer" / "era falso". desfecho ∈ reteve | saiu | sem_acao | falso_positivo | nao_aplicavel. Use o sinal_id que veio em minha_pauta ou ficha_lead. É o que impede o item de voltar amanhã.',
    inputSchema: { type: 'object', required: ['sinal_id', 'desfecho'], properties: { sinal_id: { type: 'string' }, desfecho: { type: 'string' }, nota: { type: 'string' } } } },
  { name: 'registrar_consultor',
    description: 'ESCREVE. Atribui o lead a outro colaborador DA MESMA UNIDADE ("hoje quem atendeu foi o Jhon"). Por padrão o consultor é o responsável da unidade; isto é o override.',
    inputSchema: { type: 'object', required: ['lead_id', 'consultor'], properties: { lead_id: { type: 'integer' }, consultor: { type: 'string' } } } },
  { name: 'anotar_lead',
    description: 'ESCREVE. Anota uma informação no lead (contexto que hoje se perde: "prefere manhã", "mãe decide", "vem com o irmão"). Faz APPEND com data e autor — nunca substitui o que já estava.',
    inputSchema: { type: 'object', required: ['lead_id', 'texto'], properties: { lead_id: { type: 'integer' }, texto: { type: 'string' } } } },
];

function toolsVisiveis() {
  if (!QUEM) return [];
  return [...LEITURA, ...(veTudo() ? TRAFEGO : []), ...ESCRITA];
}

async function callTool(name, a) {
  if (!QUEM) throw new Error('solicitante_nao_autorizado: o telefone carimbado nesta instancia nao esta na governanca');
  const tel = TEL; // sempre do carimbo, nunca do argumento
  const j = (x) => JSON.stringify(x);
  const gate = () => { if (!veTudo()) throw new Error('trafego_e_dado_de_diretoria: nao disponivel para este solicitante'); };
  const escrita = async (fn, args) => {
    if (DRY) return j({ dry_run: true, chamaria: fn, args });
    return j(await rpc(fn, args));
  };
  switch (name) {
    case 'minha_pauta': {
      // unidade(s) do solicitante: pega pelas estrelas (já escopadas) para não duplicar regra
      const est = await rpc('get_estrelas_matriculador_v1', { p_solicitante_telefone: tel });
      if (!est || !est.ok) return j(est);
      const lim = Math.min(Math.max(Number(a.limite || 6), 1), 20);
      const out = [];
      for (const u of est.unidades || []) {
        // unidade_id por nome (a RPC de bloco pede uuid)
        const rows = await fetch(`${URL_}/rest/v1/unidades?nome=eq.${encodeURIComponent(u.unidade)}&select=id`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }).then(r => r.json());
        const id = rows && rows[0] && rows[0].id;
        const bloco = id ? await rpc('radar_bloco_comercial_grupo_v1', { p_unidade_id: id, p_limite: lim, p_janela_dias: 30 }) : [];
        out.push({ unidade: u.unidade, hunter: u.hunter, itens: bloco });
      }
      return j({ ok: true, solicitante: est.solicitante, pauta: out });
    }
    case 'estrelas_matriculador':
      return j(await rpc('get_estrelas_matriculador_v1', { p_solicitante_telefone: tel, ...(a.ano ? { p_ano: a.ano } : {}), ...(a.mes ? { p_mes: a.mes } : {}) }));
    case 'ficha_lead':
      return j(await rpc('get_situacao_lead_v1', { p_solicitante_telefone: tel, p_telefone_lead: a.telefone || null, p_nome_lead: a.nome || null, p_lead_id: a.lead_id || null }));
    case 'agenda_do_dia':
      return j(await rpc('mila_briefing_manha_v1', { p_solicitante_telefone: tel, ...(a.data ? { p_data: a.data } : {}) }));
    case 'fechamento_do_dia':
      return j(await rpc('mila_fechamento_dia_v1', { p_solicitante_telefone: tel, ...(a.data ? { p_data: a.data } : {}) }));
    case 'pendencias_comerciais':
      return j(await rpc('radar_pendencias_comerciais_v1', { p_solicitante_telefone: tel, p_amostra: a.amostra || 8 }));
    case 'trafego_por_canal': gate();
      return j(await rpc('radar_trafego_canal_v1', { p_dias: a.dias || 30, p_maturidade_dias: a.maturidade_dias ?? 0 }));
    case 'trafego_por_criativo': gate();
      return j(await rpc('radar_trafego_criativo_v1', { ...(a.de ? { p_de: a.de } : {}), ...(a.ate ? { p_ate: a.ate } : {}) }));
    case 'publicos_reativacao': gate();
      return j(await rpc('radar_publico_reativacao_v1', {}));
    case 'registrar_curso_interesse':
      return escrita('mila_registrar_curso_interesse_v1', { p_solicitante_telefone: tel, p_lead_id: a.lead_id, p_curso: a.curso });
    case 'registrar_motivo_perda':
      return escrita('mila_registrar_motivo_perda_v1', { p_solicitante_telefone: tel, p_lead_id: a.lead_id, p_motivo: a.motivo, p_nota: a.nota || null });
    case 'registrar_canal_origem':
      return escrita('mila_registrar_canal_origem_v1', { p_solicitante_telefone: tel, p_lead_id: a.lead_id, p_canal: a.canal, p_sobrescrever: !!a.sobrescrever });
    case 'fechar_sinal':
      return escrita('mila_fechar_sinal_v1', { p_solicitante_telefone: tel, p_sinal_id: a.sinal_id, p_desfecho: a.desfecho, p_nota: a.nota || null });
    case 'registrar_consultor':
      return escrita('mila_registrar_consultor_v1', { p_solicitante_telefone: tel, p_lead_id: a.lead_id, p_consultor: a.consultor });
    case 'anotar_lead':
      return escrita('mila_anotar_lead_v1', { p_solicitante_telefone: tel, p_lead_id: a.lead_id, p_texto: a.texto });
    default: throw new Error(`tool_desconhecida: ${name}`);
  }
}

const server = new Server({ name: 'mila-gestao-tools', version: '1.0.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolsVisiveis() }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const t0 = Date.now();
  try {
    const out = await callTool(name, args || {});
    log({ tool: name, ms: Date.now() - t0, ok: true });
    return { content: [{ type: 'text', text: out }] };
  } catch (e) {
    log({ tool: name, ms: Date.now() - t0, erro: String(e.message) });
    return { content: [{ type: 'text', text: `ERRO em ${name}: ${e.message}` }], isError: true };
  }
});

await resolverQuem();
await server.connect(new StdioServerTransport());
