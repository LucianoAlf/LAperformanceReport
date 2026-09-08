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
// 🔴 O gate testava 'lider' dentro da lista de DEPARTAMENTO, e 'lider' e NIVEL.
// Efeito medido em 05/09: a Anne Krissya (departamento comercial, nivel lider,
// unidade nula = as 3) nao via trafego, embora seja quem decide onde gastar. E
// `QUEM.escopo` nunca existiu — `governanca.quem_eh` devolve
// (nome, departamento, nivel, unidade_id, pode_editar), entao a 1a condicao era
// morta. Agora e explicito: PAPEL DE REDE em area que decide midia.
// ⚠️ Nao vale so `unidade_id is null && lider`: pedagogico, financeiro e
// administrativo tambem tem lider sem unidade, e custo de midia nao e assunto
// deles (o app restringe a pagina de Trafego Pago a 2 e-mails).
const DEPTOS_QUE_VEEM_MIDIA = ['diretoria', 'marketing', 'comercial'];
const veTudo = () => !!QUEM
  && DEPTOS_QUE_VEEM_MIDIA.includes(String(QUEM.departamento || '').toLowerCase())
  && ['lider', 'diretoria'].includes(String(QUEM.nivel || '').toLowerCase());

// ── envio pelo Chatwoot: MESMO caminho do bridge (a mensagem entra na conversa
// e fica no historico dela). ⚠️ o proxy do Chatwoot devolve 403 sem User-Agent
// explicito — medido em 04/09: mesma URL e token dao 200 no curl e 403 no
// cliente HTTP sem UA.
const INBOX_POR_UNIDADE = { 'Barra': 147, 'Recreio': 148, 'Campo Grande': 155 };

async function cw(method, path, body) {
  const base = (process.env.CHATWOOT_BASE_URL || '').replace(/\/$/, '');
  const acc = process.env.CHATWOOT_ACCOUNT_ID;
  const tok = process.env.CHATWOOT_BOT_TOKEN;
  if (!base || !acc || !tok) throw new Error('chatwoot_nao_configurado');
  const res = await fetch(`${base}/api/v1/accounts/${acc}${path}`, {
    method,
    headers: { 'api_access_token': tok, 'Content-Type': 'application/json', 'User-Agent': 'mila-gestao-tools/1.0' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`chatwoot_${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// 🔴 Colaborador nao mora numa caixa. A Anne Krissya lidera as tres unidades e
// conversa comigo pela caixa da BARRA; um recado dela para a Vitoria (CG) volta
// com "unidade = Campo Grande" e, se eu procurasse so ali, o retorno morreria em
// "essa pessoa nunca falou com a Mila desta unidade". A pessoa e uma so; a caixa
// e acidente de historico. Entao: tenta a caixa da unidade e, se nao houver
// conversa, aceita QUALQUER caixa da Mila em que ela ja tenha falado.
async function enviarParaPessoa(telefone, unidadeNome, texto) {
  const digitos = String(telefone).replace(/\D/g, '');
  const preferida = INBOX_POR_UNIDADE[unidadeNome];
  const caixas = Object.values(INBOX_POR_UNIDADE);
  const busca = await cw('GET', `/contacts/search?q=${digitos}`);
  const candidatas = [];
  for (const c of (busca?.payload || [])) {
    if (String(c.phone_number || '').replace(/\D/g, '') !== digitos) continue;
    const convs = await cw('GET', `/contacts/${c.id}/conversations`);
    for (const cv of (convs?.payload || [])) {
      if (caixas.includes(cv.inbox_id)) candidatas.push(cv);
    }
  }
  if (!candidatas.length) throw new Error('essa pessoa nunca falou comigo em nenhuma unidade — nao tenho conversa aberta');
  candidatas.sort((x, y) =>
    (y.inbox_id === preferida ? 1 : 0) - (x.inbox_id === preferida ? 1 : 0)
    || (y.last_activity_at || 0) - (x.last_activity_at || 0));
  const convId = candidatas[0].id;
  const msg = await cw('POST', `/conversations/${convId}/messages`,
    { content: texto, message_type: 'outgoing', private: false });
  return { conversation_id: convId, message_id: msg?.id };
}

async function enviarWhatsApp(telefone, unidadeNome, texto) {
  const inbox = INBOX_POR_UNIDADE[unidadeNome];
  if (!inbox) throw new Error(`sem caixa da Mila para ${unidadeNome}`);
  const digitos = String(telefone).replace(/\D/g, '');
  const busca = await cw('GET', `/contacts/search?q=${digitos}`);
  let convId = null;
  for (const c of (busca?.payload || [])) {
    if (String(c.phone_number || '').replace(/\D/g, '') !== digitos) continue;
    const convs = await cw('GET', `/contacts/${c.id}/conversations`);
    const daUnidade = (convs?.payload || []).filter((cv) => cv.inbox_id === inbox);
    if (daUnidade.length) {
      convId = daUnidade.sort((x, y) => (y.last_activity_at || 0) - (x.last_activity_at || 0))[0].id;
      break;
    }
  }
  // Nao inventamos conversa: se a pessoa nunca falou com a Mila daquela unidade,
  // abrir do nada seria mandar mensagem de um numero desconhecido. Diga a ela.
  if (!convId) throw new Error('essa pessoa nunca falou com a Mila desta unidade — nao tenho conversa aberta para mandar');
  const msg = await cw('POST', `/conversations/${convId}/messages`,
    { content: texto, message_type: 'outgoing', private: false });
  return { conversation_id: convId, message_id: msg?.id };
}

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
    description: 'A AGENDA da unidade de quem pergunta num dia: TODAS as experimentais do dia com a situacao de cada uma (agendada/realizada/faltou/cancelada) + visitas (hora, aluno, curso, professor, telefone), o que ficou de ontem sem desfecho, quem faltou e ainda da pra remarcar, quem esta quente agora e a estrela mais perto. Use para "quais as experimentais de hoje?", "o que tenho na agenda?", "quem vem amanha?" — NAO use minha_pauta para isso: pauta e o que precisa de acao, agenda e quem tem aula marcada. `data` YYYY-MM-DD (padrao hoje). SEMPRE cite `reagendadas_para_outro_dia` quando vier preenchido: e o que saiu do dia e foi para outra data — a consultora precisa saber, foi reclamacao real. 🔴 QUEM LIDERA A REDE (diretoria e a Anne Krissya) recebe as TRES unidades: vem `escopo: "a REDE"`, um bloco `rede` com o consolidado e `por_unidade` com cada uma. Cite o consolidado E abra por unidade — foi para isso que ela perguntou. Para ver SO uma, mande `unidade` com o nome ("Recreio"). ⚠️ Para quem TEM unidade, `unidade` e ignorado pelo banco: nao prometa outra unidade a ela.',
    inputSchema: { type: 'object', properties: { data: { type: 'string', description: 'YYYY-MM-DD (padrao: hoje).' },
      unidade: { type: 'string', description: 'Nome da unidade (Barra | Campo Grande | Recreio). So para quem enxerga a rede; ignorado para quem tem unidade propria.' } } } },
  { name: 'fechamento_do_dia',
    description: 'Como FOI o dia na unidade de quem pergunta: experimentais realizadas e o desfecho de cada uma, faltas (remarcada? teto de 3 tentativas?), matriculas do dia, quem e de dias anteriores e segue sem desfecho, e o que ja esta marcado para o proximo dia util. Use para "como foi o dia?", "quantas experimentais teve hoje?", "quem matriculou hoje?". `data` YYYY-MM-DD (padrao hoje). 🔴 QUEM LIDERA A REDE (diretoria e a Anne Krissya) recebe as TRES unidades: vem `escopo: "a REDE"`, um bloco `rede` com o consolidado e `por_unidade` com cada uma. Cite o consolidado E abra por unidade — foi para isso que ela perguntou. Para ver SO uma, mande `unidade` com o nome ("Recreio"). ⚠️ Para quem TEM unidade, `unidade` e ignorado pelo banco: nao prometa outra unidade a ela.',
    inputSchema: { type: 'object', properties: { data: { type: 'string', description: 'YYYY-MM-DD (padrao: hoje).' },
      unidade: { type: 'string', description: 'Nome da unidade. So para quem enxerga a rede.' } } } },
  { name: 'numeros_do_mes',
    description: 'Os numeros do MES da unidade de quem pergunta, da MESMA fonte do relatorio comercial que a equipe recebe: leads, experimentais realizadas, faltas, visitas, matriculas, ticket medio da parcela e do passaporte, total de passaportes, o funil (lead->experimental->matricula) com as METAS de cada um, e os canais e cursos mais procurados. Use para "como esta o mes?", "quantos leads eu tive?", "qual meu funil?", "bati a meta?". ⚠️ Mes JA FECHADO vem do fechamento oficial (`fechado: true`) — e o mesmo numero do relatorio, nao recalcule nem compare com o vivo. Mes corrente vem ao vivo e ainda muda: diga isso. 🔴 QUEM LIDERA A REDE (diretoria e a Anne Krissya) recebe as TRES unidades: vem `escopo: "a REDE"`, um bloco `rede` com o consolidado e `por_unidade` com cada uma. Cite o consolidado E abra por unidade — foi para isso que ela perguntou. Para ver SO uma, mande `unidade` com o nome ("Recreio"). ⚠️ Para quem TEM unidade, `unidade` e ignorado pelo banco: nao prometa outra unidade a ela.',
    inputSchema: { type: 'object', properties: { ano: { type: 'integer' }, mes: { type: 'integer' },
      unidade: { type: 'string', description: 'Nome da unidade. So para quem enxerga a rede.' } } } },
  { name: 'pendencias_comerciais',
    description: 'As 5 pendências cadastrais da unidade: matriculado sem anamnese, experimental realizada sem ficha, lead sem canal de origem, lead sem curso de interesse, experimental feita sem desfecho — com total, amostra e a ação. Use para "tem pendência cadastral?", "quem está sem anamnese?". Cada uma delas você pode RESOLVER com as tools de registrar_*.',
    inputSchema: { type: 'object', properties: { amostra: { type: 'integer', description: 'Itens por bucket (padrão 8).' } } } },
  { name: 'o_que_aprendemos',
    description: '2o ANDAR. O que a escola ja APRENDEU sobre o comercial, medido com amostra e grau de confianca: onde o funil vaza, qual canal leva gente a aula, se anuncio barato traz aluno. Use quando ela perguntar "por que?", "vale a pena?", "o que funciona melhor?", ou quando voce for justificar uma orientacao. SEMPRE cite a amostra junto do numero, e diga quando `envelhecido` for true (padrao velho e pista, nao verdade). Cada padrao traz `o_que_fazer` — as acoes que ele sustenta.',
    inputSchema: { type: 'object', properties: { codigo: { type: 'string', description: 'Um padrao especifico (PC1..PC5). Vazio = todos.' } } } },
  { name: 'onde_focar',
    description: '2o ANDAR. Onde esta a oportunidade AGORA na unidade de quem pergunta: quantas pessoas em cada publico de reativacao (fez experimental e nao fechou, faltou e nunca remarcou, familias para indicacao, ex-alunos, lead que nunca agendou), com o porque de cada acao e como abordar. Use para "o que eu faco agora?", "de onde tiro matricula esse mes?", "tenho pouca gente na agenda". Devolve TAMANHO e criterio, nunca telefone — para falar com alguem especifico, use ficha_lead. Ofereca UMA acao por vez.',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'desempenho_atendimento',
    description: '2o ANDAR. Quantas conversas ficaram COM O CLIENTE ESPERANDO resposta, dia a dia, com a tendencia ja calculada (piorando/estavel/melhorando/serie_curta). Consultora ve so a PROPRIA linha; quem lidera ve a equipe das 3 unidades. Use para "estou devendo resposta pra alguem?", "como esta meu atendimento?" e, para a lideranca, "quem esta deixando cliente esperando?". ⚠️ E ESTOQUE do que ficou pendurado na foto das 19:10, NAO velocidade de resposta — nunca diga "tempo medio de resposta". Se `tendencia` for `serie_curta`, diga que ainda nao da para falar em piora: faltam dias medidos.',
    inputSchema: { type: 'object', properties: { dias: { type: 'integer', description: 'Janela (padrao 14, max 90).' } } } },
  { name: 'retomadas_do_dia',
    description: 'O BUMERANGUE. Quem pediu para ser procurado de volta e o dia chegou — com a FRASE que a pessoa disse e ha quantos dias. Use no comeco do dia e quando ela perguntar "tem alguem para eu retomar?". 🔴 SEMPRE cite `ele_disse` e a data: "a Juliana te disse em 12/06 que voltaria a falar em setembro porque o filho estava em prova". Lembrete sem a frase ela ignora. `sem_data` sao os que combinaram algo vago ("depois das ferias") — ofereca marcar um dia.',
    inputSchema: { type: 'object', properties: { data: { type: 'string', description: 'YYYY-MM-DD (padrao hoje).' } } } },
  { name: 'agenda_da_escola',
    description: 'A ESCOLA ABRE? Responde se ha expediente num dia ou num intervalo — cobre FERIADO, RECESSO ESCOLAR e ponte. Use sempre que perguntarem "amanha tem aula?", "a escola abre no feriado?", "tem aula na semana que vem?", ou antes de prometer qualquer coisa marcada para uma data. Devolve por dia: aulas_vivas, tipico (o normal daquele dia da semana) e situacao (normal | expediente_reduzido | sem_expediente | desconhecido). 🔴 `tem_expediente: null` quer dizer NAO SEI (data alem do horizonte da grade) — NUNCA leia como fechado e nunca anuncie feriado com base nisso; diga que nao consegue ver tao longe. ⚠️ A fonte e a GRADE de aulas, nao um calendario cadastrado: por isso ela sabe de recesso e ponte tambem, mas nao sabe o NOME do feriado — nao invente o motivo, diga apenas que nao ha aula.',
    inputSchema: { type: 'object', properties: {
      de: { type: 'string', description: 'YYYY-MM-DD (padrao hoje).' },
      ate: { type: 'string', description: 'YYYY-MM-DD (padrao = igual a "de"). Use para varrer a semana.' } } } },
];

// ── A BASE DE CONHECIMENTO COMERCIAL ────────────────────────────────────────
// ⚠️ Array PROPRIO, e nao dentro de LEITURA, porque a visibilidade e outra: e
//    material de VENDA. Quem nao e do comercial nem da diretoria nao ve nem a
//    tool — mesmo padrao do TRAFEGO. O gate de conteudo continua no servidor
//    (a RPC decide pelo telefone); este aqui e a segunda
//    linha, nao a unica. Duas travas, e a de fora nao substitui a de dentro.
const BASE_COMERCIAL = [
  { name: 'consultar_base_comercial',
    description: 'A BASE DE CONHECIMENTO DO COMERCIAL — como a LA vende, escrito e aprovado pelo Alf. Use SEMPRE que for orientar COMO fazer: conduzir conversa com lead, passar preco, tratar objecao, conduzir experimental e Tour, pedir indicacao, retomar quem sumiu, chamar ex-aluno de volta. E tambem quando ela perguntar "como eu faco isso?", "o que eu falo?", "qual a melhor forma?". 🔴 CITE O BLOCO E A VERSAO ("no bloco 1, Bumerangue v0.4, a regua de preco diz...") — orientacao sem fonte e opiniao, e opiniao nao e o que ela pediu. Se `envelhecido` for true, diga que o bloco venceu a revisao. 🔴 A BUSCA E POR PALAVRA E SEMPRE DEVOLVE BLOCOS, inclusive quando NENHUM serve — voltar com 3 blocos NAO significa que a base cobre o assunto. LEIA o conteudo antes de usar: se o bloco nao responde a pergunta que te fizeram, diga com todas as letras que a base ainda nao cobre isso, rotule o que voce disser como opiniao sua, e chame registrar_lacuna_base NO MESMO TURNO. O campo motivo_vazio so acende no caso raro de nada casar; nao espere por ele. 📅 SE VIER O CAMPO `contexto` (so aparece para quem lidera): ele traz o dia do mes, o mes e os TITULOS dos blocos de ritmo (campanha, corridinha, calendario). Quando a pergunta for sobre o MES — "como a gente ataca setembro", "comecou o mes", "o que fazer agora" — RITMO VEM ANTES DE FUNIL: fale de campanha e calendario primeiro, citando esses blocos, e so depois de bumerangue/experimental/indicacao. A busca e por palavra e nao leva sozinha a esses blocos; e por isso que o campo existe. E sobre `campanha_do_mes`: o sistema NAO sabe se existe uma — PERGUNTE se ja definiram, nunca afirme que falta. ⚠️ O que cada pessoa alcanca e decidido no servidor pelo telefone — nunca comente que existe material que ela nao pode ver.',
    inputSchema: { type: 'object', properties: {
      situacao: { type: 'string', description: 'A situacao em palavras suas: "lead pediu preco e sumiu", "vou pensar depois do Tour", "familia com 2 filhos quer desconto". Vazio = os primeiros blocos disponiveis.' },
      limite: { type: 'integer', description: '1 a 3 blocos (padrao 3).' } } } },
  { name: 'registrar_eficacia',
    description: 'FECHA O LACO. Registra o que uma estrategia RENDEU depois de executada — e assim a proxima vez que ela aparecer eu ja sei se funcionou. Use quando quem lidera contar o resultado de uma campanha, corridinha ou acao ("a corridinha deu 8 matriculas"). 🔴 O rotulo e obrigatorio e muda o sentido: observado = aconteceu junto · atribuido = ha razao para ligar · incremental = tem COMPARADOR (mesmo mes do ano passado, ou as unidades que nao fizeram). Sem comparador eu NAO registro como incremental — pergunto contra o que. Nunca diga que a acao CAUSOU o numero se o rotulo for observado.',
    inputSchema: { type: 'object', required: ['codigo', 'resultado', 'rotulo'], properties: {
      codigo: { type: 'string', description: 'Codigo da estrategia (EC1, EC5...). Se nao souber, use onde_focar antes.' },
      resultado: { type: 'string', description: 'O que aconteceu, com numero.' },
      rotulo: { type: 'string', description: 'observado | atribuido | incremental' },
      comparador: { type: 'string', description: 'Contra o que. Obrigatorio se rotulo=incremental.' } } } },
  { name: 'registrar_lacuna_base',
    description: 'Avisa que a base NAO tinha resposta para uma situacao real. Use quando consultar_base_comercial voltar vazio ou quando o material nao resolveu o caso concreto. Vira fila de escrita — e assim a base cresce a partir do que acontece de verdade, nao do que alguem imaginou. Nao serve para reclamar de sistema nem para pedido de funcionalidade.',
    inputSchema: { type: 'object', required: ['o_que_faltou'], properties: {
      situacao: { type: 'string', description: 'O caso que apareceu.' },
      o_que_faltou: { type: 'string', description: 'O que a base deveria dizer e nao diz.' } } } },
];
const TRAFEGO = [
  { name: 'trafego_por_canal',
    description: 'DIRETORIA. Desempenho por canal: leads, agendamentos, matrículas, gasto, custo por lead e por matrícula, retorno em LTV. 🔴 SEMPRE que citar `gasto` ou `custo_matricula`, CONFIRA `gasto_dias_cobertos` contra `janela_dias` e, se faltar dia, diga na MESMA frase quantos dias faltam e que o custo é PISO — em 08/09 ela deu o agosto certo e omitiu que o Meta cobre só 28 dos 31 dias (a captura nasceu em 04/08), e quem leu aquilo como o gasto do mês subestimou a mídia. 🔴 SEMPRE que citar `custo_matricula` ou `conv_pct`, diga na MESMA frase quantos leads ainda não tiveram tempo: o campo `leads_imaturos` conta os criados há menos de `dias_p50_ate_converter` dias (a mediana medida entre o lead pago chegar e virar matrícula). Com imaturos relevantes, `custo_matricula` é um **TETO que ainda vai cair**, nunca "o custo" — em 08/09 ela disse "R$ 1.185 por matrícula" com 109 de 467 leads sem chance de converter, e o Alf respondeu "tá errado". 🔴 NÃO ranqueie canal por conversão com pouca matrícula (4 contra 3 é ruído, não resultado) — diga que a diferença ainda não separa. ⚠️ Os canais vêm agrupados por VERBA, e é assim que deve ser lido: `Instagram/Facebook` é UMA linha porque é uma conta só do Meta (o gasto é indivisível na fonte), e `Site` entra no `Google` (é a landing page da campanha — regra do Alf, 03/09). Não desagregue nem "corrija" isso: dois canais cobrando da mesma plataforma foi o que duplicou o gasto até 08/09. 🔴 AS DUAS RESSALVAS APONTAM PARA LADOS OPOSTOS — nunca junte as duas: `leads_imaturos` > 0 significa que faltam MATRÍCULAS por chegar, então `custo_matricula` é TETO e vai CAIR; `gasto_dias_cobertos` < `janela_dias` significa que falta GASTO por entrar, então é um PISO que ainda vai subir. Uma mexe no denominador, a outra no numerador. Em 08/09 ela disse que a cobertura incompleta fazia o custo ser "teto e pode cair" — está invertido, e faz quem lê achar que o número só melhora. ⚠️ `gasto` NULL com `gasto_dias_cobertos`=0 = NÃO SEI (nunca "de graça"); canal orgânico é "sem mídia", não "custo zero". 🔴 PEDIU UM MÊS? USE `de`/`ate` (ex.: agosto = de:2026-08-01, ate:2026-08-31). Janela rolante NÃO é proxy de mês e entregá-la como se fosse é o erro de 08/09: ele pediu "agosto inteiro", ela mandou os últimos 30 dias chamando de proxy, e o número saiu quase no dobro (custo por matrícula R$ 1.185 contra R$ 639 do agosto real). Se a ferramenta não souber responder o que foi pedido, diga que não sabe — nunca entregue outro período. `dias`/`maturidade_dias` só quando a pergunta não tem período nomeado.',
    inputSchema: { type: 'object', properties: {
      de: { type: 'string', description: 'Inicio do periodo fechado, YYYY-MM-DD. Use SEMPRE que pedirem um MES ou intervalo nomeado.' },
      ate: { type: 'string', description: 'Fim do periodo fechado, YYYY-MM-DD. Obrigatorio junto com `de`.' },
      dias: { type: 'integer', description: 'Janela ROLANTE a partir de hoje. So quando a pergunta nao tem periodo nomeado.' },
      maturidade_dias: { type: 'integer' } } } },
  { name: 'trafego_por_criativo',
    description: 'DIRETORIA. Funil por criativo do Meta: gasto → conversa → lead → AGENDAMENTO → experimental → matrícula. Ranqueie por custo de AGENDAMENTO, não por custo de conversa (é o que inverte o ranking). Se cohort_madura=false, avise que o número ainda vai mudar.',
    inputSchema: { type: 'object', properties: { de: { type: 'string', description: 'YYYY-MM-DD' }, ate: { type: 'string' } } } },
  { name: 'publicos_reativacao',
    description: 'DIRETORIA/GESTÃO. Tamanho dos públicos prontos para reativação (fez experimental e não matriculou, faltou e nunca remarcou, famílias ativas p/ indicação, ex-alunos, frios). Devolve TAMANHO, nunca telefone.',
    inputSchema: { type: 'object', properties: {} } },
];
// ── tools de ESCRITA (uma por intenção; validadas e com trilha no banco) ─────
const ESCRITA = [
  { name: 'registrar_retomada',
    description: 'ESCREVE. Guarda que um lead pediu para ser procurado depois ("me chama em janeiro", "volta a falar comigo daqui a 3 meses"). 🔴 `frase` e OBRIGATORIA e tem de ser o que a PESSOA disse, nao o seu resumo — e ela que faz a consultora lembrar do caso la na frente. `prazo_texto` e a expressao dela ("em janeiro", "daqui a 3 meses"); eu converto para data. Se a expressao for vaga ("depois das ferias") eu guardo SEM data e aviso — nao invento dia. Registrar de novo para o mesmo lead SUBSTITUI o combinado anterior.',
    inputSchema: { type: 'object', required: ['lead_id', 'frase'],
      properties: { lead_id: { type: 'integer' }, frase: { type: 'string', description: 'O que a pessoa disse, nas palavras dela.' },
                    prazo_texto: { type: 'string', description: 'A expressao de tempo dela.' },
                    motivo: { type: 'string', description: 'preco | horario | distancia | concorrente | outro' } } } },
  { name: 'desfecho_retomada',
    description: 'ESCREVE. Fecha uma retomada com o que aconteceu: matriculou | segue_interessado | nao_quer | sem_resposta. E o MEDIR — sem isso nao da para aprender se retomar no prazo converte mais. Se for `segue_interessado`, ofereca marcar a proxima data com registrar_retomada.',
    inputSchema: { type: 'object', required: ['retomada_id', 'desfecho'],
      properties: { retomada_id: { type: 'string' },
                    desfecho: { type: 'string', enum: ['matriculou','segue_interessado','nao_quer','sem_resposta'] },
                    nota: { type: 'string' } } } },
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
  { name: 'propor_recado',
    description: 'PROPOE (nao envia) uma mensagem que EU vou mandar em nome de quem pediu — para um LEAD/cliente, para um PROFESSOR, ou para um COLABORADOR da equipe (consultora, lider). Recado para colaborador ESPERA RESPOSTA: eu aviso a pessoa, ela me responde, e eu levo a resposta de volta a quem pediu. Ex.: "avisa a Jaqueline que eu retorno amanha a tarde", "avisa o professor que o Caio vai faltar". Eu escrevo o texto, MOSTRO para ela e SO ENVIO depois que ela aprovar com enviar_recado. Se voltar `ambiguo`, PERGUNTE qual — nunca escolha. A proposta vence em 30 min.',
    inputSchema: { type: 'object', required: ['destino_tipo', 'destino', 'texto'],
      properties: { destino_tipo: { type: 'string', enum: ['lead','professor','colaborador'] },
                    destino: { type: 'string', description: 'nome, telefone ou id' },
                    texto: { type: 'string', description: 'a mensagem pronta, ja assinada por mim (Mila), como ela vai chegar' },
                    assunto: { type: 'string', description: 'o que a consultora pediu, em poucas palavras (fica na trilha)' } } } },
  { name: 'revisar_recado',
    description: 'TROCA o texto de um recado que ainda esta PROPOSTO, quando ela diz "nao fala isso", "troca X por Y", "poe assim". Mantem o MESMO recado_id — nao proponha outro por cima, senao ela pode aprovar o errado. Renova os 30 min. Depois de enviado nao da para trocar: ai e um recado novo corrigindo.',
    inputSchema: { type: 'object', required: ['recado_id', 'novo_texto'],
      properties: { recado_id: { type: 'string' }, novo_texto: { type: 'string' },
                    motivo: { type: 'string', description: 'o que ela pediu para mudar, em poucas palavras' } } } },
  { name: 'recado_pendente',
    description: 'Qual proposta de recado esta em aberto com esta consultora agora. Use quando ela disser "troca isso", "manda entao", "pode" e voce NAO tiver o recado_id a mao (reinicio de sessao, rajada de mensagens). Se nao houver pendente, PERGUNTE de que recado ela fala — nao adivinhe.',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'recado_para_mim',
    description: 'O que ALGUEM DA EQUIPE pediu para eu avisar a esta pessoa e ainda esta sem resposta. Chame quando ela responder algo que parece retorno de um recado ("pode falar pra Anne que ja fiz", "diz pra ela que...") ou quando ela perguntar se tem recado. Se houver mais de um, PERGUNTE de qual ela fala.',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'responder_recado',
    description: 'Registra a RESPOSTA dela a um recado e me devolve para quem levar. Depois de chamar, escreva o retorno para quem pediu (citando o pedido e a resposta) e mande com enviar_retorno_recado. Nunca invente a resposta: use o que ela disse.',
    inputSchema: { type: 'object', required: ['recado_id', 'resposta'],
      properties: { recado_id: { type: 'string' }, resposta: { type: 'string', description: 'O que ela respondeu, nas palavras dela.' } } } },
  { name: 'enviar_retorno_recado',
    description: 'LEVA a resposta de volta a quem pediu o recado. So depois de responder_recado. O texto e voce que escreve, com o pedido original e a resposta dela.',
    inputSchema: { type: 'object', required: ['recado_id', 'texto'],
      properties: { recado_id: { type: 'string' }, texto: { type: 'string' } } } },
  { name: 'enviar_recado',
    description: 'ENVIA o recado que ela ACABOU de aprovar. So chame depois de um "pode", "manda", "isso mesmo" — nunca por conta propria, nunca no mesmo turno em que voce propos. Use o recado_id que veio de propor_recado.',
    inputSchema: { type: 'object', required: ['recado_id'], properties: { recado_id: { type: 'string' } } } },
  { name: 'resolver_conversa',
    description: 'ESCREVE NO CHATWOOT. Marca a conversa de um lead como RESOLVIDA. 🔴 Use SOMENTE quando a pessoa PEDIR ("pode fechar", "marca como resolvida", "ja acabou esse") — NUNCA por conta propria. O aberta/resolvida e a declaracao dela sobre o proprio trabalho: ela deixa aberto so o que ainda da pra resgatar, e e desse sinal que a pauta do dia depende. Fechar sozinha destruiria justamente o que a gente passou a ler. ⚠️ PECA O MOTIVO NO MESMO TURNO e registre com registrar_motivo_perda — fechar sem motivo so troca um buraco por outro: sai da lista de cobranca e volta amanha como "conversa encerrada e o motivo nao foi registrado". Se ela disser que quer ser procurada mais pra frente, use registrar_retomada com a frase dela em vez de fechar.',
    inputSchema: { type: 'object', required: ['lead_id'], properties: {
      lead_id: { type: 'integer', description: 'O lead cuja conversa deve ser fechada.' } } } },
  { name: 'anotar_lead',
    description: 'ESCREVE. Anota uma informação no lead (contexto que hoje se perde: "prefere manhã", "mãe decide", "vem com o irmão"). Faz APPEND com data e autor — nunca substitui o que já estava.',
    inputSchema: { type: 'object', required: ['lead_id', 'texto'], properties: { lead_id: { type: 'integer' }, texto: { type: 'string' } } } },
];

// Quem alcanca a base comercial: o time de venda e a diretoria. Espelha a
// regra que `mila_base_comercial_v1` aplica no servidor — se as duas divergirem,
// vale a de dentro, e esta aqui so some com a tool da lista.
const veBaseComercial = () => !!QUEM
  && (String(QUEM.departamento || '').toLowerCase() === 'comercial'
      || String(QUEM.nivel || '').toLowerCase() === 'diretoria');

function toolsVisiveis() {
  if (!QUEM) return [];
  return [...LEITURA, ...(veBaseComercial() ? BASE_COMERCIAL : []),
          ...(veTudo() ? TRAFEGO : []), ...ESCRITA];
}

// Nome da unidade -> uuid. O modelo fala "Recreio", nunca um uuid — pedir
// uuid a ele e convite a alucinacao.
// ⚠️ Nome desconhecido LEVANTA erro em vez de virar null: null silencioso
//    devolveria a REDE INTEIRA para quem pediu UMA unidade.
const _unidadeCache = new Map();
async function unidadeIdPorNome(nome) {
  if (!nome) return null;
  const chave = String(nome).trim().toLowerCase();
  if (_unidadeCache.has(chave)) return _unidadeCache.get(chave);
  const rows = await fetch(`${URL_}/rest/v1/unidades?select=id,nome&ativo=eq.true`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }).then((r) => r.json());
  const norm = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const achou = (rows || []).find((u) => norm(u.nome) === norm(nome));
  if (!achou) {
    throw new Error(`unidade_desconhecida: "${nome}" — as ativas sao ${(rows || []).map((u) => u.nome).join(", ")}`);
  }
  _unidadeCache.set(chave, achou.id);
  return achou.id;
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
      // ⚠️ `p_unidade_id` so tem efeito para quem enxerga a rede; a RPC o
      //    IGNORA para quem tem unidade propria (trava no banco).
      return j(await rpc('mila_briefing_manha_v1', { p_solicitante_telefone: tel,
        ...(a.data ? { p_data: a.data } : {}), p_unidade_id: await unidadeIdPorNome(a.unidade) }));
    case 'fechamento_do_dia':
      return j(await rpc('mila_fechamento_dia_v1', { p_solicitante_telefone: tel,
        ...(a.data ? { p_data: a.data } : {}), p_unidade_id: await unidadeIdPorNome(a.unidade) }));
    case 'numeros_do_mes':
      return j(await rpc('mila_numeros_do_mes_v1', { p_solicitante_telefone: tel,
        ...(a.ano ? { p_ano: a.ano } : {}), ...(a.mes ? { p_mes: a.mes } : {}),
        p_unidade_id: await unidadeIdPorNome(a.unidade) }));
    case 'retomadas_do_dia':
      return j(await rpc('mila_retomadas_do_dia_v1', { p_solicitante_telefone: tel, ...(a.data ? { p_data: a.data } : {}) }));
    case 'agenda_da_escola':
      // ⚠️ Sem p_unidade_id: feriado nacional fecha as tres. Unidade so
      //    importaria para fechamento isolado (obra, falta de luz), e ai a
      //    pergunta e outra.
      return j(await rpc('escola_agenda_v1', {
        ...(a.de ? { p_de: a.de } : {}), ...(a.ate ? { p_ate: a.ate } : {}), p_unidade_id: null }));
    case 'consultar_base_comercial':
      // ⚠️ `p_origem` NAO esta no inputSchema de proposito: quem declara se isto
      //    e ensaio e o processo (DRY), nunca o modelo. Sem isso a suite de
      //    sombra, que usa telefone real de consultora, entraria no log como
      //    uso de producao e inflaria a medicao de adocao da base.
      return j(await rpc('mila_base_comercial_v1', { p_solicitante_telefone: tel,
        ...(a.situacao ? { p_situacao: a.situacao } : {}), ...(a.limite ? { p_limite: a.limite } : {}),
        p_origem: DRY ? 'ensaio' : 'producao' }));
    case 'registrar_eficacia':
      if (DRY) return j({ ok: true, dry_run: true, recado: 'ensaio: eficacia nao gravada' });
      return j(await rpc('mila_registrar_eficacia_v1', { p_solicitante_telefone: tel,
        p_codigo_estrategia: a.codigo, p_resultado: a.resultado, p_rotulo: a.rotulo,
        ...(a.comparador ? { p_comparador: a.comparador } : {}) }));
    case 'registrar_lacuna_base':
      // ⚠️ Escrita: respeita o DRY_RUN do perfil de sombra como as outras.
      if (DRY) return j({ ok: true, dry_run: true, recado: 'ensaio: lacuna nao gravada' });
      return j(await rpc('mila_registrar_lacuna_base_v1', { p_solicitante_telefone: tel,
        p_situacao: a.situacao || null, p_o_que_faltou: a.o_que_faltou }));
    case 'pendencias_comerciais':
      return j(await rpc('radar_pendencias_comerciais_v1', { p_solicitante_telefone: tel, p_amostra: a.amostra || 8 }));
    case 'o_que_aprendemos':
      return j(await rpc('mila_padroes_v1', { p_solicitante_telefone: tel, ...(a.codigo ? { p_codigo: a.codigo } : {}) }));
    case 'onde_focar':
      return j(await rpc('mila_estrategias_v1', { p_solicitante_telefone: tel }));
    case 'desempenho_atendimento':
      return j(await rpc('mila_atendimento_serie_v1', { p_solicitante_telefone: tel, ...(a.dias ? { p_dias: a.dias } : {}) }));
    case 'trafego_por_canal': gate();
      // 🔴 Periodo FECHADO quando a pessoa pede uma competencia. Ate 08/09 so
      //    havia janela rolante, e ela entregou "ultimos 30 dias" para quem
      //    pediu AGOSTO — trazendo 8 dias de setembro e perdendo 8 de agosto.
      //    O custo por matricula saiu quase o dobro do real (R$ 1.185 x R$ 639).
      return j(await rpc('radar_trafego_canal_v1', {
        p_dias: a.dias || 30, p_maturidade_dias: a.maturidade_dias ?? 0,
        p_de: a.de || null, p_ate: a.ate || null }));
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
    case 'registrar_retomada':
      return escrita('mila_registrar_retomada_v1', { p_solicitante_telefone: tel, p_lead_id: a.lead_id,
        p_frase: a.frase, p_prazo_texto: a.prazo_texto || null, p_motivo: a.motivo || null });
    case 'desfecho_retomada':
      return escrita('mila_desfecho_retomada_v1', { p_solicitante_telefone: tel,
        p_retomada_id: a.retomada_id, p_desfecho: a.desfecho, p_nota: a.nota || null });
    case 'registrar_consultor':
      return escrita('mila_registrar_consultor_v1', { p_solicitante_telefone: tel, p_lead_id: a.lead_id, p_consultor: a.consultor });
    case 'propor_recado':
      return j(await rpc('mila_propor_recado_v1', { p_solicitante_telefone: tel, p_destino_tipo: a.destino_tipo,
        p_destino_ref: String(a.destino), p_texto: a.texto, p_assunto: a.assunto || null }));
    case 'revisar_recado':
      return j(await rpc('mila_revisar_recado_v1', { p_solicitante_telefone: tel, p_recado_id: a.recado_id,
        p_novo_texto: a.novo_texto, p_motivo: a.motivo || null }));
    case 'recado_pendente':
      return j(await rpc('mila_recado_pendente_v1', { p_solicitante_telefone: tel }));
    case 'enviar_recado': {
      // 🔴 DRY_RUN TEM QUE COBRIR O ENVIO. Esta tool nao passa pelo helper `w`
      // das escritas — em modo sombra ela mandaria WhatsApp de verdade para um
      // cliente ou professor. E a mesma armadilha do incidente da Sol
      // (registrador com default de producao dentro de teste).
      if (DRY) return j({ dry_run: true, enviaria: true, recado_id: a.recado_id,
                          nota: 'modo sombra: nada foi enviado e o recado segue proposto' });
      // 1) o banco valida e APROVA (so quem pediu, so na unidade dela, so dentro dos 30 min)
      const ap = await rpc('mila_aprovar_recado_v1', { p_solicitante_telefone: tel, p_recado_id: a.recado_id });
      if (!ap?.ok) return j(ap);
      // 2) o envio e daqui: o cracha (service key + token do Chatwoot) nunca passa pelo modelo
      try {
        // Colaborador nao mora numa caixa: procura a pessoa em qualquer uma (ver
        // enviarParaPessoa). Lead e professor seguem presos a unidade, que e o certo.
        const corpo = ap.destino.tipo === 'colaborador'
          ? `${ap.texto}

_${ap.de} me pediu para te avisar. Pode me responder por aqui que eu levo a resposta._`
          : ap.texto;
        const r = ap.destino.tipo === 'colaborador'
          ? await enviarParaPessoa(ap.destino.telefone, ap.unidade, corpo)
          : await enviarWhatsApp(ap.destino.telefone, ap.unidade, corpo);
        await rpc('mila_confirmar_recado_v1', { p_recado_id: a.recado_id,
          p_conversation_id: r.conversation_id, p_message_id: r.message_id });
        return j({ ok: true, enviado: true, para: ap.destino.nome, conversa: r.conversation_id,
                   aguarda_resposta: !!ap.aguarda_resposta });
      } catch (e) {
        await rpc('mila_confirmar_recado_v1', { p_recado_id: a.recado_id, p_erro: String(e.message || e) });
        return j({ ok: false, enviado: false, motivo: String(e.message || e),
                   nota: 'nao saiu — diga isso a ela, nao finja que mandou' });
      }
    }
    case 'recado_para_mim':
      return j(await rpc('mila_recado_para_mim_v1', { p_telefone: tel }));
    case 'responder_recado':
      return j(await rpc('mila_responder_recado_v1', { p_telefone: tel,
        p_recado_id: a.recado_id, p_resposta: a.resposta }));
    case 'enviar_retorno_recado': {
      // A VOLTA. Mesma disciplina do envio: em sombra nao sai nada.
      if (DRY) return j({ dry_run: true, levaria: true, recado_id: a.recado_id,
                          nota: 'modo sombra: o retorno nao foi entregue' });
      // 🔴 LEITURA, nao re-resposta. A 1a versao chamava responder_recado de novo
      // so para descobrir o destino, e isso SOBRESCREVERIA a resposta real com
      // um texto de servico.
      const pend = await rpc('mila_retorno_pendente_v1', { p_telefone: tel, p_recado_id: a.recado_id });
      if (!pend?.ok) return j(pend);
      const destino = pend.levar_para;
      try {
        const r = await enviarParaPessoa(destino.telefone, destino.unidade, a.texto);
        await rpc('mila_confirmar_retorno_recado_v1', { p_recado_id: a.recado_id,
          p_conversation_id: r.conversation_id });
        return j({ ok: true, entregue: true, para: destino.nome, conversa: r.conversation_id });
      } catch (e) {
        await rpc('mila_confirmar_retorno_recado_v1', { p_recado_id: a.recado_id,
          p_erro: String(e.message || e) });
        return j({ ok: false, entregue: false, motivo: String(e.message || e),
                   nota: 'o retorno nao saiu — diga isso, nao finja que levou' });
      }
    }
    case 'resolver_conversa': {
      if (DRY) return j({ ok: true, dry_run: true, recado: 'ensaio: conversa nao foi fechada' });
      // ⚠️ O id da conversa vem do ESPELHO, nao do modelo: pedir o
      //    conversation_id como argumento deixaria o modelo escolher qual
      //    conversa fechar, e errar ali fecha a conversa de outra pessoa.
      const r = await rpc('mila_conversa_do_lead_v1', { p_solicitante_telefone: tel, p_lead_id: a.lead_id });
      if (!r?.ok) return j(r || { ok: false, motivo: 'sem_resposta' });
      if (r.ja_resolvida) return j({ ok: true, ja_estava: true, conversation_id: r.conversation_id,
        recado: 'Essa conversa ja estava resolvida — nao mexi. ' +
                (r.motivo_registrado ? 'E o motivo ja esta registrado.'
                                     : 'So falta o motivo: me diz em uma palavra o que houve.') });
      const convId = r.conversation_id;
      await cw('POST', `/conversations/${convId}/toggle_status`, { status: 'resolved' });
      return j({ ok: true, conversation_id: convId,
        recado: 'Conversa marcada como resolvida. Agora me diz em uma palavra o que houve, que eu registro o motivo.' });
    }
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
