#!/usr/bin/env node
// O TELEFONE PASSA A VIAJAR NA CHAMADA (07/09/2026).
//
// 🔴 POR QUE MUDEI O QUE EU MESMO TINHA ESCRITO. A 1a versao lia
//    `SOL_SOLICITANTE_TELEFONE` do processo, no espelho do `agentId` da Maria:
//    identidade resolvida ANTES do modelo. Ao ligar de verdade, descobri que
//    nao da — e a razao e do runtime, nao do desenho:
//
//      `mcp_tool.py:3027` monta `StdioServerParameters(env=_build_safe_env(
//      user_env))`, onde `user_env` e o bloco `env:` do config.yaml. O env do
//      processo MCP e ESTATICO. E o `get_session_env` do gateway e uma context
//      var de Python interna ao processo dele, que nao atravessa para o
//      subprocesso. Confirmado tambem no host: ha UM conjunto de processos MCP
//      por gateway (`--ppid 3827965`), nao um por conversa.
//
//    Um telefone fixo no `env:` seria PIOR que o argumento: toda conversa se
//    passaria pela mesma pessoa. Entao o telefone vem na chamada.
//
// ⚠️ O QUE ISSO CUSTA, dito sem maquiagem: o modelo informa o numero, logo pode
//    informar o de um colega. O envelope do bridge ja escreve `Participante que
//    enviou:`, entao o valor certo esta a mao; e o historico do grupo tem os
//    outros, entao o errado tambem. O gate por telefone continua real — ele so
//    nao e mais inforjavel.
//
// O que sustenta seguir assim:
//   1. E MUITO melhor que hoje: a porta larga `sol-acesso-restrito__query` deixa
//      o modelo escrever SELECT livre e digitar qualquer telefone dentro dele.
//   2. O pior caso e ver o escopo de outro COLABORADOR JA AUTORIZADO, nao dado
//      arbitrario, e sempre dentro das 12 perguntas.
//   3. `sol_resolver_escopo_v1` registra toda chamada em `automacao_log`
//      (evento `sol_portas`): telefone alegado, para quem resolveu, publico,
//      unidade e recusa. Mentira vira DETECTAVEL, que e a parte que faltava.
//
// 🔴 O FIX DE VERDADE, e por que NAO e agora: um cracha opaco por turno — o
//    bridge emite, o modelo so carrega, e ele nunca ve identidade de terceiro
//    (a forma exata do `agentId` da Maria). Nao entra aqui porque o bridge da
//    Sol e READ-ONLY por desenho (`BEGIN READ ONLY` em `runPsqlReadonly`), e
//    dar escrita a ele e decisao com consequencia, nao detalhe de implementacao.
//    Fica para a Fatia 2, junto com o resto do trabalho de bridge.
import fs from 'node:fs';

// ⚠️ A barra e MONTADA, nunca escrita: escape em template literal atravessa
//    heredoc/shell e chega comido — aconteceu 3x so nesta sessao.
const BS = String.fromCharCode(92);

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-portas-telefone-por-chamada-07set.mjs <sol-portas-mcp.mjs>'); process.exit(2); }
let s = fs.readFileSync(alvo, 'utf8');

if (s.includes('p_solicitante_telefone: { type:')) { console.log('ja aplicado'); process.exit(0); }

// ⚠️ Guarda de ancora declarando o numero esperado — 27/08 provou que assumir 1
//    esconde metade da correcao (a CTE que aparecia 2x na retificacao).
const trocas = [
  // 1. o env deixa de ser a fonte e vira so fallback de ensaio
  [`// ⚠️ O telefone de quem fala vem do PROCESSO, nunca do modelo. O bridge o
//    injeta ao subir o servidor, como o \`agentId\` da Maria vem do remetente
//    antes do modelo abrir a boca.
const TEL = process.env.SOL_SOLICITANTE_TELEFONE || '';`,
   `// ⚠️ O env e FALLBACK DE ENSAIO, nao a fonte. Em producao o telefone vem no
//    argumento \`p_solicitante_telefone\` (veja o cabecalho do patch de 07/09):
//    o processo MCP recebe env estatico e e UM so para todas as conversas, entao
//    fixar o numero aqui faria toda conversa se passar pela mesma pessoa.
const TEL_ENSAIO = process.env.SOL_SOLICITANTE_TELEFONE || '';`, 1],

  // 2. rpc() para de carimbar o telefone do processo
  [`    body: JSON.stringify({ p_solicitante_telefone: TEL, ...args }),`,
   `    body: JSON.stringify(args),`, 1],

  // 3. o campo entra no schema de TODA porta, junto com o de unidade
  [`const U = { p_unidade: { type: 'string', description: 'Só a diretoria escolhe unidade. Para os demais, deixe vazio — eu já sei qual é a sua.' } };`,
   `// ⚠️ \`Q\` (quem) entra em TODA porta; \`U\` (unidade) so onde faz sentido.
const Q = { p_solicitante_telefone: { type: 'string', description: 'O telefone de quem mandou a mensagem — copie do "Participante que enviou" do envelope, só os dígitos. Não é opcional e não é para inventar: é ele que decide qual unidade você enxerga, e toda chamada fica registrada com esse número. Se não souber quem falou, pergunte em vez de chutar.' } };
const U = { ...Q, p_unidade: { type: 'string', description: 'Só a diretoria escolhe unidade. Para os demais, deixe vazio — eu já sei qual é a sua.' } };`, 1],

  // 4. a unica porta sem `...U` precisa do campo explicito
  [`    schema: { p_amostra: { type: 'integer', description: '1 a 8 nomes de exemplo. Padrão 3.' } } },`,
   `    schema: { ...Q, p_amostra: { type: 'integer', description: '1 a 8 nomes de exemplo. Padrão 3.' } } },`, 1],

  // 5. o despacho passa a exigir o telefone da chamada (com o ensaio como rede)
  [`  if (!TEL) return j({ ok: false, motivo: 'sem_solicitante',
    recado: 'Não sei quem está perguntando — o telefone vem do processo, não da conversa.' });`,
   `const tel = String((args && args.p_solicitante_telefone) || TEL_ENSAIO || '').replace(/${BS}D/g, '');
  if (!tel) return j({ ok: false, motivo: 'sem_solicitante',
    recado: 'Não sei quem está perguntando. Me diga o telefone de quem pediu (está no "Participante que enviou") — sem isso eu não sei qual unidade mostrar.' });`, 1],
];

for (const [de, para, esperado] of trocas) {
  const n = s.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA esperava ${esperado}, achei ${n}:\n${de.slice(0, 90)}`); process.exit(1); }
  s = s.split(de).join(para);
}

// 6. o telefone limpo tem de chegar ao corpo da RPC
const ANC = `  const limpos = {};`;
if ((s.split(ANC).length - 1) !== 1) { console.error('ANCORA limpos: esperava 1'); process.exit(1); }
s = s.replace(ANC, `  const limpos = { p_solicitante_telefone: tel };`);

fs.writeFileSync(alvo, s);
console.log('telefone por chamada aplicado — 6 trocas');
