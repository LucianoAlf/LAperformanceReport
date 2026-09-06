#!/usr/bin/env node
// AS DUAS TOOLS DA BASE DE CONHECIMENTO COMERCIAL no `mila-gestao-tools-mcp.mjs`.
//
// A base tem 11 blocos aprovados pelo Alf em 06/09 e, até agora, ninguém a lê:
// as RPCs existem e a Mila não sabe que existem. Estas entradas fecham o cano.
//
// 🔴 O GATE NÃO ESTÁ AQUI. `mila_base_comercial_v1` resolve o público pelo
//    telefone no SERVIDOR (departamento + nível). A tool não recebe público como
//    argumento e o modelo não escolhe: consultora pede a base e recebe os 6
//    blocos dela; se pedir mídia paga, não vem — e não vem nem o título.
//
// ⚠️ TOOL NOVA NÃO BASTA — TEM QUE ENSINAR QUANDO USAR. É a cicatriz de 05/09:
//    a Mila tinha `o_que_aprendemos` disponível e mesmo assim respondeu de
//    intuição ("porque já mostrou interesse real"). Por isso a descrição diz o
//    GATILHO ("quando ela pedir orientação de como fazer") e a OBRIGAÇÃO
//    (citar bloco e versão), não só o que a tool devolve.
//
// ⚠️ Array PRÓPRIO, não dentro de LEITURA: quem não é do comercial nem da
//    diretoria não vê nem a tool na lista. É a segunda linha; a primeira é o
//    gate do servidor, e é ela que vale se as duas divergirem.
import fs from 'node:fs';

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-tools-base-comercial-06set.mjs <mila-gestao-tools-mcp.mjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── as declarações, no fim de LEITURA ───────────────────────────────────────
trocar(
  `    inputSchema: { type: 'object', properties: { data: { type: 'string', description: 'YYYY-MM-DD (padrao hoje).' } } } },
];`,
  `    inputSchema: { type: 'object', properties: { data: { type: 'string', description: 'YYYY-MM-DD (padrao hoje).' } } } },
];

// ── A BASE DE CONHECIMENTO COMERCIAL ────────────────────────────────────────
// ⚠️ Array PROPRIO, e nao dentro de LEITURA, porque a visibilidade e outra: e
//    material de VENDA. Quem nao e do comercial nem da diretoria nao ve nem a
//    tool — mesmo padrao do TRAFEGO. O gate de conteudo continua no servidor
//    (a RPC decide pelo telefone); este aqui e a segunda
//    linha, nao a unica. Duas travas, e a de fora nao substitui a de dentro.
const BASE_COMERCIAL = [
  { name: 'consultar_base_comercial',
    description: 'A BASE DE CONHECIMENTO DO COMERCIAL — como a LA vende, escrito e aprovado pelo Alf. Use SEMPRE que for orientar COMO fazer: conduzir conversa com lead, passar preco, tratar objecao, conduzir experimental e Tour, pedir indicacao, retomar quem sumiu, chamar ex-aluno de volta. E tambem quando ela perguntar "como eu faco isso?", "o que eu falo?", "qual a melhor forma?". 🔴 CITE O BLOCO E A VERSAO ("no bloco 1, Bumerangue v0.4, a regua de preco diz...") — orientacao sem fonte e opiniao, e opiniao nao e o que ela pediu. Se \`envelhecido\` for true, diga que o bloco venceu a revisao. Se vier vazio com motivo_vazio=nenhum_bloco_casou_com_a_situacao, NAO invente: diga que a base ainda nao cobre isso e use registrar_lacuna_base. ⚠️ O que cada pessoa alcanca e decidido no servidor pelo telefone — nunca comente que existe material que ela nao pode ver.',
    inputSchema: { type: 'object', properties: {
      situacao: { type: 'string', description: 'A situacao em palavras suas: "lead pediu preco e sumiu", "vou pensar depois do Tour", "familia com 2 filhos quer desconto". Vazio = os primeiros blocos disponiveis.' },
      limite: { type: 'integer', description: '1 a 3 blocos (padrao 3).' } } } },
  { name: 'registrar_lacuna_base',
    description: 'Avisa que a base NAO tinha resposta para uma situacao real. Use quando consultar_base_comercial voltar vazio ou quando o material nao resolveu o caso concreto. Vira fila de escrita — e assim a base cresce a partir do que acontece de verdade, nao do que alguem imaginou. Nao serve para reclamar de sistema nem para pedido de funcionalidade.',
    inputSchema: { type: 'object', required: ['o_que_faltou'], properties: {
      situacao: { type: 'string', description: 'O caso que apareceu.' },
      o_que_faltou: { type: 'string', description: 'O que a base deveria dizer e nao diz.' } } } },
];`,
  'declaracao das 2 tools num array proprio');

// ── a visibilidade ──────────────────────────────────────────────────────────
trocar(
  `function toolsVisiveis() {
  if (!QUEM) return [];
  return [...LEITURA, ...(veTudo() ? TRAFEGO : []), ...ESCRITA];
}`,
  `// Quem alcanca a base comercial: o time de venda e a diretoria. Espelha a
// regra que `+"`"+`mila_base_comercial_v1`+"`"+` aplica no servidor — se as duas divergirem,
// vale a de dentro, e esta aqui so some com a tool da lista.
const veBaseComercial = () => !!QUEM
  && (String(QUEM.departamento || '').toLowerCase() === 'comercial'
      || String(QUEM.nivel || '').toLowerCase() === 'diretoria');

function toolsVisiveis() {
  if (!QUEM) return [];
  return [...LEITURA, ...(veBaseComercial() ? BASE_COMERCIAL : []),
          ...(veTudo() ? TRAFEGO : []), ...ESCRITA];
}`,
  'visibilidade da base comercial');

// ── o despacho ──────────────────────────────────────────────────────────────
trocar(
  `    case 'pendencias_comerciais':`,
  `    case 'consultar_base_comercial':
      return j(await rpc('mila_base_comercial_v1', { p_solicitante_telefone: tel,
        ...(a.situacao ? { p_situacao: a.situacao } : {}), ...(a.limite ? { p_limite: a.limite } : {}) }));
    case 'registrar_lacuna_base':
      // ⚠️ Escrita: respeita o DRY_RUN do perfil de sombra como as outras.
      if (DRY) return j({ ok: true, dry_run: true, recado: 'ensaio: lacuna nao gravada' });
      return j(await rpc('mila_registrar_lacuna_base_v1', { p_solicitante_telefone: tel,
        p_situacao: a.situacao || null, p_o_que_faltou: a.o_que_faltou }));
    case 'pendencias_comerciais':`,
  'despacho das 2 tools');

fs.writeFileSync(alvo, src);
console.log(`\nescrito ${alvo}  (${antes} -> ${src.length} bytes)`);
