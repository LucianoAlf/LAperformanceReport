#!/usr/bin/env node
// O ESCOPO É DE QUEM FALA, NÃO DA CAIXA DE ENTRADA (08/09/2026).
//
// 🔴 O CASO, conversa 8809 (inbox 147/Barra), hoje 15:11 UTC. A Anne Krissya —
//    líder do comercial das TRÊS unidades, `unidade_id` NULL na governança —
//    perguntou "os leads estão muito tempo sem atendimento?".
//
//    A tool `desempenho_atendimento` devolveu, na frente dela:
//      escopo:      "a equipe das 3 unidades"
//      solicitante: "Anne Krissya"
//      pessoas:     Vitória (CG+Recreio), Kailane (Barra), Daiana (Recreio),
//                   Gabriela (CG), Luciano (as 3)  ← CINCO pessoas, TRÊS unidades
//
//    E a Mila respondeu: "Na Barra, sim: 2 esperando resposta e 2 com mais de
//    24h." Depois, ao "E nas outras unidades?": *"Das outras unidades eu não
//    consigo abrir daqui, Anne."*
//
//    Ela CONSEGUIA — estava no contexto dela. Pior: o "2 e 2" que ela chamou de
//    Barra é a linha da **Gabriela Leal, de Campo Grande**; a Barra (Kailane)
//    tinha 14 esperando e 13 com mais de 24h. Um erro só produziu três: filtrou
//    o que não devia, pegou a linha errada e inventou uma limitação para
//    justificar a lacuna.
//
// 🔴 A CAUSA NÃO É PERMISSÃO — o banco está certo e já diferencia:
//      Kailane (consultora) → escopo "só você",                1 pessoa
//      Krissya (líder rede) → escopo "a equipe das 3 unidades", 5 pessoas
//      Luciano (diretoria)  → escopo "a equipe das 3 unidades", 5 pessoas
//    O carimbo dela também está certo (o telefone DELA, via
//    `MILA_SOLICITANTE_TELEFONE: ${MILA_CONSULTOR_TELEFONE}` no perfil consultor).
//
//    A causa é que a MENSAGEM que chega ao modelo carrega `Unidade: Barra`,
//    derivada do INBOX. A caixa de entrada é a porta por onde a pessoa escreveu;
//    nunca foi o limite do que ela pode ver.
//
// ⚠️ NÃO TOCA no caminho de LEAD (`buildMilaPrompt`): lá a unidade do inbox É a
//    resposta certa (lead que escreve para a Barra é lead da Barra), e aquele é
//    o SDR que atende cliente.
//
// ⚠️ FAIL-CLOSED: se `quemEh` não resolver a pessoa, cai na unidade do inbox —
//    o comportamento de hoje. Escopo de rede exige identidade confirmada com
//    `unidade_id` nulo, nunca ausência de dado.
const fs = require('fs');

const alvo = process.argv[2] || '/home/mila/.openclaw/workspace/scripts/chatwoot-mila-bridge.js';
let s = fs.readFileSync(alvo, 'utf8');

if (s.includes('escopoRede')) { console.log('ja aplicado'); process.exit(0); }

const Q = String.fromCharCode(39);   // apóstrofo montado: escrevê-lo solto dentro
                                     // de string aninhada já embolou várias vezes

function trocar(velho, novo, rotulo) {
  const n = s.split(velho).length - 1;
  if (n !== 1) { console.error('ANCORA ' + rotulo + ': esperava 1, achei ' + n); process.exit(1); }
  s = s.split(velho).join(novo);
}

// ── A. a assinatura recebe o ESCOPO pronto, não mais "unit" ────────────────
trocar(
  'function buildConsultantPrompt(name, phone, unit, content, contexto) {',
  'function buildConsultantPrompt(name, phone, escopoLinhas, content, contexto) {',
  'assinatura');

trocar(
  '  return `[MODO CONSULTOR]\\nConsultor: ${name}\\nTelefone: ${phone}\\nUnidade: ${unit}\\n`',
  [
    '  // 🔴 `escopoLinhas` vem da GOVERNANCA (quem e a pessoa), nao do inbox. Ate',
    '  //    08/09 esta linha dizia `Unidade: <inbox>`, e foi o que fez a Mila',
    '  //    esconder da lider do comercial as 3 unidades que a tool tinha acabado',
    '  //    de devolver para ela (conv. 8809).',
    '  return `[MODO CONSULTOR]\\nConsultor: ${name}\\nTelefone: ${phone}\\n${escopoLinhas}\\n`',
  ].join('\n'),
  'return do prompt');

// ── B. a identidade é resolvida SEMPRE, e diz se a pessoa é de rede ────────
trocar(
  [
    '  let podeEditar = false;',
    '  let consultorNome;',
    '  let consultorUnidade;',
    '  if (consultantMode) {',
    '    const identidade = await quemEh(senderPhone);',
    '    podeEditar = identidade?.pode_editar === true;',
    '    if (!podeEditar) {',
    '      consultorNome = identidade?.nome || ' + Q + 'desconhecido' + Q + ';',
    '      consultorUnidade = await unidadeNome(identidade?.unidade_id);',
    '    }',
    '  }',
  ].join('\n'),
  [
    '  let podeEditar = false;',
    '  let consultorNome;',
    '  let consultorUnidade;',
    '  // 🔴 Quem tem `unidade_id` nulo na governanca lidera a REDE (diretoria,',
    '  //    lider do comercial, Sucesso do Aluno). Para essa pessoa a caixa de',
    '  //    entrada e so a porta — nunca o limite.',
    '  let escopoRede = false;',
    '  if (consultantMode) {',
    '    const identidade = await quemEh(senderPhone);',
    '    podeEditar = identidade?.pode_editar === true;',
    '    // ⚠️ FAIL-CLOSED: sem identidade confirmada o escopo de rede NAO nasce, e',
    '    //    a unidade volta a ser a do inbox (o comportamento de antes daqui).',
    '    escopoRede = !!identidade && identidade.unidade_id == null;',
    '    consultorNome = identidade?.nome || ' + Q + 'desconhecido' + Q + ';',
    '    consultorUnidade = identidade',
    '      ? await unidadeNome(identidade.unidade_id)',
    '      : (INBOX_UNIT[inboxId] || ' + Q + 'desconhecida' + Q + ');',
    '  }',
  ].join('\n'),
  'bloco de identidade');

// ── C. o chamador monta o escopo ───────────────────────────────────────────
trocar(
  [
    '    const prompt = consultantMode',
    '      ? buildConsultantPrompt(cwSender.name || ' + Q + 'Consultor' + Q + ', senderPhone, INBOX_UNIT[inboxId] || ' + Q + 'desconhecida' + Q + ', content, contextoGuardado)',
    '      : buildMilaPrompt(payload, currentConversation);',
  ].join('\n'),
  [
    '    // A caixa de entrada entra no prompt como PORTA, nunca como cerca.',
    '    const escopoLinhas = escopoRede',
    '      ? ' + Q + 'Escopo: REDE — as 3 unidades (Barra, Campo Grande, Recreio). Quem fala aqui lidera a rede: o que as ' + Q,
    '        + ' + Q + 'ferramentas devolverem das três é dela por direito, e esconder qualquer parte disso é mentir.' + Q + ' + `\\n`',
    '        + `Caixa de entrada: ${INBOX_UNIT[inboxId] || ' + Q + 'desconhecida' + Q + '} (é apenas a porta por onde ela escreveu, NÃO o limite do que ela enxerga)`',
    '      : `Unidade: ${consultorUnidade || INBOX_UNIT[inboxId] || ' + Q + 'desconhecida' + Q + '}`;',
    '    const prompt = consultantMode',
    '      ? buildConsultantPrompt(cwSender.name || ' + Q + 'Consultor' + Q + ', senderPhone, escopoLinhas, content, contextoGuardado)',
    '      : buildMilaPrompt(payload, currentConversation);',
  ].join('\n'),
  'chamador do prompt');

// ── D. o carimbo vai SEMPRE, inclusive para quem pode editar ───────────────
// 🔴 Até aqui `MILA_CONSULTOR_TELEFONE` só era passado quando `!podeEditar`.
//    Quem tem `pode_editar=true` (Luciano, Hugo, Anne Susan) cai no perfil raiz,
//    cujo `mila-gestao-tools` não tem bloco `env:` — e o wrapper então usa o
//    arquivo de segredo, que traz o telefone do LUCIANO fixo. Ou seja: hoje o
//    Hugo e a Anne Susan falam com a Mila carimbados como Luciano, e toda
//    escrita (recado, anotação, retomada) fica com a autoria dele.
trocar(
  '      ...((consultantMode && !podeEditar) ? {',
  '      ...(consultantMode ? {',
  'extraEnv condicional');

const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
fs.copyFileSync(alvo, alvo + '.bak-' + carimbo + '-before-escopo-de-quem-fala');
fs.writeFileSync(alvo, s);
console.log('ok: escopo passa a vir da governanca; carimbo vai sempre');
