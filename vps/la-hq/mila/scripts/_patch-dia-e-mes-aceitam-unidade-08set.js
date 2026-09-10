#!/usr/bin/env node
// AS TRÊS TOOLS DO DIA/MÊS PASSAM A ACEITAR RECORTE POR UNIDADE (08/09/2026).
//
// 🔴 ACHADO DA BATERIA. A migration `mila_dia_e_mes_para_quem_lidera_a_rede`
//    fez `agenda_do_dia`, `fechamento_do_dia` e `numeros_do_mes` responderem a
//    quem lidera a rede (antes devolviam `sem_unidade` para a Krissya e para o
//    Alf). Mas **o MCP não repassava o `p_unidade_id`** — então eles recebiam
//    sempre as três unidades juntas e não conseguiam pedir *"e o Recreio?"*.
//
//    Conserto de banco sem a ponta é meio conserto: a bateria pegou porque
//    testa pelo MCP, não pela RPC.
//
// ⚠️ O modelo passa o NOME da unidade, não uuid. Pedir uuid ao modelo é convite
//    a alucinação — e o nome é o que a pessoa fala.
//
// ⚠️ DEFESA EM PROFUNDIDADE: a RPC **ignora** `p_unidade_id` para quem tem
//    unidade própria (a trava está no banco, provada na migration). Aqui a
//    descrição também diz isso, para o modelo não prometer à consultora algo
//    que ela não vai receber.
//
// ⚠️ Nome que não existe vira `unidade_desconhecida` em vez de virar NULL — NULL
//    silencioso devolveria a rede inteira para quem pediu UMA unidade, que é o
//    oposto do pedido.
const fs = require('fs');

const alvo = process.argv[2] || '/home/mila/.openclaw/workspace/scripts/mila-gestao-tools-mcp.mjs';
let s = fs.readFileSync(alvo, 'utf8');

if (s.includes('unidadeIdPorNome')) { console.log('ja aplicado'); process.exit(0); }

function trocar(velho, novo, rotulo) {
  const n = s.split(velho).length - 1;
  if (n !== 1) { console.error('ANCORA ' + rotulo + ': esperava 1, achei ' + n); process.exit(1); }
  s = s.split(velho).join(novo);
}

// ── 1. resolvedor de nome -> uuid ──────────────────────────────────────────
trocar(
  'async function callTool(name, a) {',
  [
    '// Nome da unidade -> uuid. O modelo fala "Recreio", nunca um uuid — pedir',
    '// uuid a ele e convite a alucinacao.',
    '// ⚠️ Nome desconhecido LEVANTA erro em vez de virar null: null silencioso',
    '//    devolveria a REDE INTEIRA para quem pediu UMA unidade.',
    'const _unidadeCache = new Map();',
    'async function unidadeIdPorNome(nome) {',
    '  if (!nome) return null;',
    '  const chave = String(nome).trim().toLowerCase();',
    '  if (_unidadeCache.has(chave)) return _unidadeCache.get(chave);',
    '  const rows = await fetch(`${URL_}/rest/v1/unidades?select=id,nome&ativo=eq.true`,',
    '    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }).then((r) => r.json());',
    '  const norm = (x) => String(x || \'\').normalize(\'NFD\').replace(/[\\u0300-\\u036f]/g, \'\').trim().toLowerCase();',
    '  const achou = (rows || []).find((u) => norm(u.nome) === norm(nome));',
    '  if (!achou) {',
    '    throw new Error(`unidade_desconhecida: "${nome}" — as ativas sao ${(rows || []).map((u) => u.nome).join(", ")}`);',
    '  }',
    '  _unidadeCache.set(chave, achou.id);',
    '  return achou.id;',
    '}',
    '',
    'async function callTool(name, a) {',
  ].join('\n'),
  'inicio de callTool');

// ── 2. os três handlers repassam o recorte ─────────────────────────────────
trocar(
  "    case 'agenda_do_dia':\n"
  + "      return j(await rpc('mila_briefing_manha_v1', { p_solicitante_telefone: tel, ...(a.data ? { p_data: a.data } : {}) }));",
  "    case 'agenda_do_dia':\n"
  + "      // ⚠️ `p_unidade_id` so tem efeito para quem enxerga a rede; a RPC o\n"
  + "      //    IGNORA para quem tem unidade propria (trava no banco).\n"
  + "      return j(await rpc('mila_briefing_manha_v1', { p_solicitante_telefone: tel,\n"
  + "        ...(a.data ? { p_data: a.data } : {}), p_unidade_id: await unidadeIdPorNome(a.unidade) }));",
  'handler agenda_do_dia');

trocar(
  "    case 'fechamento_do_dia':\n"
  + "      return j(await rpc('mila_fechamento_dia_v1', { p_solicitante_telefone: tel, ...(a.data ? { p_data: a.data } : {}) }));",
  "    case 'fechamento_do_dia':\n"
  + "      return j(await rpc('mila_fechamento_dia_v1', { p_solicitante_telefone: tel,\n"
  + "        ...(a.data ? { p_data: a.data } : {}), p_unidade_id: await unidadeIdPorNome(a.unidade) }));",
  'handler fechamento_do_dia');

trocar(
  "    case 'numeros_do_mes':\n"
  + "      return j(await rpc('mila_numeros_do_mes_v1', { p_solicitante_telefone: tel, ...(a.ano ? { p_ano: a.ano } : {}), ...(a.mes ? { p_mes: a.mes } : {}) }));",
  "    case 'numeros_do_mes':\n"
  + "      return j(await rpc('mila_numeros_do_mes_v1', { p_solicitante_telefone: tel,\n"
  + "        ...(a.ano ? { p_ano: a.ano } : {}), ...(a.mes ? { p_mes: a.mes } : {}),\n"
  + "        p_unidade_id: await unidadeIdPorNome(a.unidade) }));",
  'handler numeros_do_mes');

// ── 3. as declarações ganham `unidade` e ensinam a ler o modo REDE ─────────
const REDE = ' 🔴 QUEM LIDERA A REDE (diretoria e a Anne Krissya) recebe as TRES unidades: '
  + 'vem `escopo: "a REDE"`, um bloco `rede` com o consolidado e `por_unidade` com cada uma. '
  + 'Cite o consolidado E abra por unidade — foi para isso que ela perguntou. '
  + 'Para ver SO uma, mande `unidade` com o nome ("Recreio"). '
  + '⚠️ Para quem TEM unidade, `unidade` e ignorado pelo banco: nao prometa outra unidade a ela.';

trocar(
  "    inputSchema: { type: 'object', properties: { data: { type: 'string', description: 'YYYY-MM-DD (padrao: hoje).' } } } },\n"
  + "  { name: 'fechamento_do_dia',",
  "    inputSchema: { type: 'object', properties: { data: { type: 'string', description: 'YYYY-MM-DD (padrao: hoje).' },\n"
  + "      unidade: { type: 'string', description: 'Nome da unidade (Barra | Campo Grande | Recreio). So para quem enxerga a rede; ignorado para quem tem unidade propria.' } } } },\n"
  + "  { name: 'fechamento_do_dia',",
  'schema agenda_do_dia');

trocar(
  "    inputSchema: { type: 'object', properties: { data: { type: 'string', description: 'YYYY-MM-DD (padrao: hoje).' } } } },\n"
  + "  { name: 'numeros_do_mes',",
  "    inputSchema: { type: 'object', properties: { data: { type: 'string', description: 'YYYY-MM-DD (padrao: hoje).' },\n"
  + "      unidade: { type: 'string', description: 'Nome da unidade. So para quem enxerga a rede.' } } } },\n"
  + "  { name: 'numeros_do_mes',",
  'schema fechamento_do_dia');

// ⚠️ Este schema aparece DUAS vezes no arquivo (`estrelas_matriculador` tem o
//    mesmo). A âncora precisa incluir a linha seguinte para ser única — a 1ª
//    versão contou 2 e a guarda abortou, que é o comportamento certo dela.
trocar(
  "    inputSchema: { type: 'object', properties: { ano: { type: 'integer' }, mes: { type: 'integer' } } } },\n"
  + "  { name: 'pendencias_comerciais',",
  "    inputSchema: { type: 'object', properties: { ano: { type: 'integer' }, mes: { type: 'integer' },\n"
  + "      unidade: { type: 'string', description: 'Nome da unidade. So para quem enxerga a rede.' } } } },\n"
  + "  { name: 'pendencias_comerciais',",
  'schema numeros_do_mes');

// as descrições passam a explicar o modo rede
for (const [marca, rotulo] of [
  ['a consultora precisa saber, foi reclamacao real.', 'descricao agenda_do_dia'],
  ['"quem matriculou hoje?". `data` YYYY-MM-DD (padrao hoje).', 'descricao fechamento_do_dia'],
  ['Mes corrente vem ao vivo e ainda muda: diga isso.', 'descricao numeros_do_mes'],
]) {
  const n = s.split(marca).length - 1;
  if (n !== 1) { console.error('ANCORA ' + rotulo + ': esperava 1, achei ' + n); process.exit(1); }
  s = s.split(marca).join(marca + REDE);
}

const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
fs.copyFileSync(alvo, alvo + '.bak-' + carimbo + '-antes-recorte-unidade');
fs.writeFileSync(alvo, s);
console.log('ok: agenda/fechamento/numeros aceitam recorte por unidade');
