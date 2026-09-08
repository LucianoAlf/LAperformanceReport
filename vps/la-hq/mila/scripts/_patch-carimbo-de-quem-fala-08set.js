#!/usr/bin/env node
// O CARIMBO PASSA A SER DE QUEM FALA TAMBÉM NO PERFIL RAIZ (08/09/2026).
//
// 🔴 O BURACO. O bridge escolhe o perfil por `pode_editar`:
//      pode_editar=false → perfil `mila-consultor-readonly`, cujo
//                          `mila-gestao-tools` tem
//                          `env: MILA_SOLICITANTE_TELEFONE: ${MILA_CONSULTOR_TELEFONE}`
//                          → carimbo correto, o telefone da pessoa ✅
//      pode_editar=true  → perfil RAIZ, cujo `mila-gestao-tools` NÃO tem bloco
//                          `env:` → o wrapper cai em
//                          `secrets/mila-gestao-tools.env`, que traz
//                          `MILA_SOLICITANTE_TELEFONE=5521981278047` FIXO ❌
//
//    5521981278047 é o telefone do Luciano. Os três com `pode_editar=true` são
//    Luciano, **Hugo** e **Anne Susan** — ou seja, hoje o Hugo e a Anne Susan
//    conversam com a Mila carimbados como Luciano. Os três são diretoria e veem
//    o mesmo dado, então nada vazou; o que está errado é a AUTORIA: recado,
//    anotação de lead e retomada gravam o Luciano como quem pediu.
//
// ⚠️ POR QUE O WRAPPER PRECISA DE UM FILTRO. O bloco `env:` interpola `${VAR}`.
//    Quando a variável não existe — perfil raiz chamado por cron ou pelo
//    Telegram, onde não há remetente — o que chega pode ser vazio OU a literal
//    `${MILA_CONSULTOR_TELEFONE}`. Um carimbo que não é telefone faria
//    `governanca.quem_eh` não resolver ninguém, e `toolsVisiveis()` devolve
//    lista VAZIA quando `QUEM` é nulo: o agente ficaria sem nenhuma ferramenta,
//    em silêncio. Por isso o wrapper passa a exigir dígitos antes de aceitar.
//
// ⚠️ NÃO ponho `MILA_CARIMBO_OBRIGATORIO` no perfil raiz, de propósito: ali o
//    fallback para o arquivo de segredo é o comportamento CERTO (cron e
//    Telegram falam pela casa, não por uma pessoa). Fail-closed só faz sentido
//    onde existe um remetente para exigir — que é o perfil do consultor, onde
//    já está ligado.
const fs = require('fs');

const WRAPPER = process.argv[2] || '/home/mila/.openclaw/workspace/scripts/mila-gestao-tools-mcp.sh';
const CONFIG  = process.argv[3] || '/home/mila/.hermes/config.yaml';

const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
let falhou = false;

function trocar(caminho, velho, novo, rotulo, marcaJaFeito) {
  let t = fs.readFileSync(caminho, 'utf8');
  if (t.includes(marcaJaFeito)) { console.log('  (ja aplicado) ' + caminho); return; }
  const n = t.split(velho).length - 1;
  if (n !== 1) {
    console.error('  ANCORA "' + rotulo + '" em ' + caminho + ': esperava 1, achei ' + n);
    falhou = true; return;
  }
  fs.copyFileSync(caminho, caminho + '.bak-' + carimbo + '-antes-carimbo-de-quem-fala');
  fs.writeFileSync(caminho, t.split(velho).join(novo));
  console.log('  ok ' + caminho);
}

// ── 1. wrapper: carimbo que não é telefone não é carimbo ───────────────────
const W_VELHO = '_CARIMBO="${MILA_SOLICITANTE_TELEFONE:-${MILA_CONSULTOR_TELEFONE:-}}"';
const W_NOVO = [
  W_VELHO,
  '# 🔴 Carimbo que nao e telefone NAO e carimbo (08/09/2026). O bloco `env:` do',
  '#    config.yaml interpola ${VAR}; sem a variavel (perfil raiz por cron/Telegram)',
  '#    o que chega pode ser vazio OU a literal "${MILA_CONSULTOR_TELEFONE}". Lixo',
  '#    aqui faz `governanca.quem_eh` nao resolver ninguem, e `toolsVisiveis()`',
  '#    devolve lista VAZIA com QUEM nulo: o agente ficaria mudo, sem nenhuma tool,',
  '#    e sem dizer por que. Melhor cair no fallback conhecido do que num carimbo',
  '#    invalido.',
  'if [[ ! "$_CARIMBO" =~ ^[0-9]{10,15}$ ]]; then _CARIMBO=""; fi',
].join('\n');

console.log('wrapper:');
trocar(WRAPPER, W_VELHO, W_NOVO, 'carimbo sanitizado', 'Carimbo que nao e telefone');

// ── 2. perfil raiz: o remetente vira o carimbo ─────────────────────────────
const C_VELHO = [
  '  mila-gestao-tools:',
  '    command: /home/mila/.openclaw/workspace/scripts/mila-gestao-tools-mcp.sh',
  '    args: []',
].join('\n');

const C_NOVO = [
  '  mila-gestao-tools:',
  '    command: /home/mila/.openclaw/workspace/scripts/mila-gestao-tools-mcp.sh',
  '    args: []',
  '    # 🔴 QUEM PEDE vem do REMETENTE, nao do arquivo de segredo (08/09/2026).',
  '    #    Sem este bloco o wrapper caia em secrets/mila-gestao-tools.env, que',
  '    #    tem o telefone do LUCIANO fixo — e o Hugo e a Anne Susan (os outros',
  '    #    dois com pode_editar=true, que caem neste perfil) falavam com a Mila',
  '    #    carimbados como ele, inclusive na AUTORIA de recado e anotacao.',
  '    # ⚠️ SEM MILA_CARIMBO_OBRIGATORIO aqui, de proposito: este perfil tambem',
  '    #    serve cron e Telegram, onde nao ha remetente e o fallback para o',
  '    #    arquivo e o comportamento certo. O wrapper ignora carimbo que nao',
  '    #    seja telefone, entao interpolacao vazia nao vira lixo.',
  '    env:',
  '      MILA_SOLICITANTE_TELEFONE: ${MILA_CONSULTOR_TELEFONE}',
].join('\n');

console.log('config raiz:');
trocar(CONFIG, C_VELHO, C_NOVO, 'mila-gestao-tools sem env', 'QUEM PEDE vem do REMETENTE');

process.exit(falhou ? 1 : 0);
