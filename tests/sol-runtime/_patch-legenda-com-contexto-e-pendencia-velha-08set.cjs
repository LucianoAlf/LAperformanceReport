#!/usr/bin/env node
// DOIS CONSERTOS DO CASO LÚCIA/RECREIO — 17 MINUTOS PARA LANÇAR (08/09/2026).
//
// 🔴 O CASO, grupo FINANCEIRO LA RECREIO. A Vitória mandou o comprovante de
//    R$ 1.227,38 às 19:23, com a legenda:
//
//      parcelas de setembro, alunos, Lúcia Lai Keun Dang Silva - R$385,00
//      Henrique Dang Silva - R$457,38
//      Christiano Lopes Silva - R$385,00
//      Total: R$1.227,38 - pix
//
//    A Sol respondeu *"Manda cada aluno com seu valor, por exemplo: João —
//    R$ 360"* — pedindo o que estava escrito na frente dela. Foram SEIS idas e
//    vindas e 17 minutos até lançar, com a ADM chamando o Luciano no grupo.
//
// ── DEFEITO 1 — o prefixo de contexto matava a linha do aluno ──────────────
//
// Provado com o código real (`prova-parser-legenda-multi-aluno.cjs`):
//
//   "parcelas de setembro, alunos, Lúcia Lai Keun Dang Silva - R$385,00" -> null
//   "Henrique Dang Silva - R$457,38"    -> {Henrique Dang Silva, 457.38}
//   "Christiano Lopes Silva - R$385,00" -> {Christiano Lopes Silva, 385}
//
// 2 itens em vez de 3 → soma 842,38 ≠ 1.227,38 → `soma_divergente` → o pedido
// de divisão. A MESMA lista, sem o prefixo, dá 3 itens e funciona (foi o que
// aconteceu às 19:24).
//
// A culpada é `_RE_NAO_E_NOME_NA_LINHA`, que barra linha começando por
// "parcelas|passaportes|taxas|total…". Ela existe por um bom motivo: sem ela,
// "Passaporte do Canto — R$400" viraria um aluno chamado *Passaporte do Canto*.
// O erro não é a guarda existir — é ela olhar só o COMEÇO da linha e desistir.
//
// ⚠️ CONSERTO MÍNIMO E PRECISO: quando a guarda dispara **e a linha tem vírgula
//    seguida de letra**, tenta de novo a partir da última vírgula desse tipo.
//    · "parcelas de setembro, alunos, Lúcia … - R$385,00" → vira "Lúcia … 385" ✅
//    · "Passaporte do Canto - R$400"  → NÃO tem vírgula, segue barrado ✅
//    · "Taxa de matrícula - R$150"    → idem ✅
//    A vírgula do centavo ("385,00") é ignorada de propósito: só conta vírgula
//    seguida de LETRA. Sem isso, cortar na última vírgula deixaria "00".
//
// ⚠️ Isto NÃO é regex nova de diálogo — é o parser da LISTA que a própria Sol
//    ensina a mandar ("Nome — R$ valor"). O compromisso vigente é não criar
//    gatilho conversacional novo; aqui eu AFROUXO uma guarda de extração que
//    estava recusando o formato que ela mesma pediu.
//
// ── DEFEITO 2 — a correção grudou numa pendência morta ─────────────────────
//
// Às 19:24 a lista reenviada gerou o preview CERTO (3 itens, R$ 1.227,38).
// Às 19:27 a Vitória corrigiu a competência — e a Sol respondeu *"ainda falta
// uma divisão verificável por aluno"*, como se não tivesse os 3 itens.
//
// No log: `multi_itens_deterministicos itens=2 origem=correcao`. A correção foi
// para o `manual_review_multi_student` das 19:23 (o defeituoso, com 2 itens),
// que continuava ABERTO ao lado do preview bom. O código de correção reprocessa
// `multiTextoHumano + a mensagem nova` — e o `multiTextoHumano` guardado era a
// legenda ruim. Duas pendências vivas para o mesmo comprovante, e a correção
// pegou a errada.
//
// ⚠️ Já existe um dedup, mas só de `manual_review` contra `manual_review` do
//    mesmo valor. Preview bom nascendo NÃO encerrava a revisão manual velha.
//    Agora encerra: um comprovante, uma pendência.
const fs = require('fs');

const alvo = process.argv[2] || '/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs';
let s = fs.readFileSync(alvo, 'utf8');

if (s.includes('_tentaDepoisDoContexto')) { console.log('ja aplicado'); process.exit(0); }

function trocar(velho, novo, rotulo) {
  const n = s.split(velho).length - 1;
  if (n !== 1) { console.error('ANCORA ' + rotulo + ': esperava 1, achei ' + n); process.exit(1); }
  s = s.split(velho).join(novo);
}

// ── 1. a guarda passa a olhar depois do contexto ───────────────────────────
trocar(
  `function _linhaNomeValorSol(linha) {
  const m = String(linha || '').match(_RE_LINHA_NOME_VALOR);
  if (!m) return null;
  const nome = m[1].replace(/\\s+/g, ' ').trim();
  if (_RE_NAO_E_NOME_NA_LINHA.test(nome)) return null;`,
  `// 🔴 A ADM escreve contexto antes da lista: "parcelas de setembro, alunos,
//    Lúcia Lai Keun Dang Silva - R$385,00". A guarda de rotulo barrava a linha
//    inteira e o aluno SUMIA — 2 itens de 3, soma divergente, e a Sol pedindo a
//    divisão que ja estava na tela (Recreio, 08/09, 17 minutos de ida e volta).
// ⚠️ So corta em virgula seguida de LETRA: a virgula do centavo ("385,00")
//    deixaria "00" como nome. E linha sem virgula ("Passaporte do Canto -
//    R$400") continua barrada, que e a razao de a guarda existir.
function _tentaDepoisDoContexto(linha) {
  const t = String(linha || '');
  const cortes = [];
  const re = /,(?=\\s*[A-Za-zÀ-ÿ])/g;
  let m;
  while ((m = re.exec(t)) !== null) cortes.push(m.index);
  if (!cortes.length) return null;
  const cauda = t.slice(cortes[cortes.length - 1] + 1);
  const mm = cauda.match(_RE_LINHA_NOME_VALOR);
  if (!mm) return null;
  const nome = mm[1].replace(/\\s+/g, ' ').trim();
  if (_RE_NAO_E_NOME_NA_LINHA.test(nome)) return null;   // rótulo de novo: desiste
  return { nome, bruto: mm[2] };
}
function _linhaNomeValorSol(linha) {
  const m = String(linha || '').match(_RE_LINHA_NOME_VALOR);
  // ⚠️ DOIS caminhos levam a cauda, e a 1a versao deste patch so cobria um.
  //    A linha real NEM CASOU o formato: "parcelas de setembro, alunos, Lucia
  //    Lai Keun Dang Silva" tem 9 palavras e o nome aceita no maximo 5. Entao
  //    tentar a cauda so quando a guarda de rotulo dispara nao resolvia nada —
  //    a prova com o codigo real mostrou isso antes de eu subir.
  let nome; let bruto;
  if (!m) {
    const alt = _tentaDepoisDoContexto(linha);
    if (!alt) return null;
    nome = alt.nome; bruto = alt.bruto;
  } else {
    nome = m[1].replace(/\\s+/g, ' ').trim();
    bruto = m[2];
    if (_RE_NAO_E_NOME_NA_LINHA.test(nome)) {
      const alt = _tentaDepoisDoContexto(linha);
      if (!alt) return null;
      nome = alt.nome; bruto = alt.bruto;
    }
  }`,
  'guarda de rotulo');

trocar(
  `  const valor = parseBRMoney(m[2]);
  if (!valor || valor <= 0) return null;
  return { nome, valor };
}`,
  `  const valor = parseBRMoney(bruto);
  if (!valor || valor <= 0) return null;
  return { nome, valor };
}`,
  'uso do valor');

// ── 2. preview bom encerra a revisão manual velha ──────────────────────────
trocar(
  `    arr.push(pendencia); pendentes.set(event.chatId, arr);
    log({ acao: 'preview_multi_aluno_enviado', chatId: event.chatId, itens: itens.length, valor_total: intent.valor_total });`,
  `    // 🔴 UM COMPROVANTE, UMA PENDENCIA. A revisao manual do mesmo valor tem de
    //    morrer aqui: em 08/09 ela ficou aberta ao lado deste preview, e a
    //    correcao de competencia da ADM grudou NELA — reprocessando a legenda
    //    ruim (2 itens) e respondendo "ainda falta uma divisao por aluno" com
    //    os 3 itens ja montados. O dedup que existia so cobria
    //    manual_review x manual_review.
    const mortas = arr.filter((p) => p.tipoOperacao === 'manual_review_multi_student'
      && p.valor != null && intent.valor_total != null
      && Math.abs(Number(p.valor) - Number(intent.valor_total)) < 0.01);
    for (const morta of mortas) arr.splice(arr.indexOf(morta), 1);
    if (mortas.length) {
      log({ acao: 'manual_review_encerrada_por_preview', chatId: event.chatId,
            quantas: mortas.length, valor: intent.valor_total });
    }
    arr.push(pendencia); pendentes.set(event.chatId, arr);
    log({ acao: 'preview_multi_aluno_enviado', chatId: event.chatId, itens: itens.length, valor_total: intent.valor_total });`,
  'push do preview multi');

const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
fs.copyFileSync(alvo, alvo + '.bak-' + carimbo + '-antes-legenda-com-contexto');
fs.writeFileSync(alvo, s);
console.log('ok: legenda com contexto volta a render aluno; preview encerra revisao velha');
console.log('⚠️ REINICIE a bridge do caixa — require no start');
