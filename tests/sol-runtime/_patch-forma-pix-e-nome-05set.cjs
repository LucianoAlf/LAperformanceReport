#!/usr/bin/env node
// AUDITORIA DOS 3 GRUPOS, 03-05/09/2026 — quatro raizes medidas no caixa.log.
// Nenhuma cria gramatica nova de dialogo (compromisso vigente): as quatro
// consertam LEITURA DE DADO (forma, nome, linha "Nome R$ valor", candidatos).
//
// F1  PIX EXPLICITO VENCE "DEBITO" SOLTO.  6 de 6 correcoes de forma em 3 dias
//     foram "foi pix" (Moises 13:32, Luiz Eduardo 13:54, Manuela 13:57 ...).
//     Causa: `SINAL_CARTAO` aceita a palavra `debito` sozinha, e TODO
//     comprovante de Pix de banco diz "Debito em conta". Pior: o ramo do OCR
//     sobrescrevia SEM condicao a forma que `extrairForma` ja lera certa (ela
//     testa /pix/ primeiro, de proposito). Cupom de maquininha nunca escreve
//     "pix", entao sinal FORTE (bandeira/NSU/adquirente/"venda debito"/"cartao
//     de debito") continua vencendo.
//
// F2  NOME COM APOSTROFO E TRACO OPCIONAL.  Caso Vitoria/Recreio 05/09 12:41:
//     "Marcio Sant'Anna R$395,00 / Valentina Cortes Santanna R$468,16 / Maria
//     Luiza Cortes Sant'Anna R$385,00 / total R$1.248,16 - pix". O detector e o
//     parser exigiam o traco `-`/`—` E recusavam apostrofo — 2 dos 3 alunos sao
//     Sant'Anna. Saiu card unico de R$395 e a Vitoria chamou o Luciano; as 3
//     parcelas foram lancadas A MAO, sem aluno_id e sem fatura_id.
//     A regra passa a ser UMA SO (`_linhaNomeValorSol`) usada nos dois lugares:
//     duas copias da mesma regra e o padrao que gerou as duplicatas de renovacao.
//
// F3  PLURAL NAO ROTULA NOME, E FRASE NAO E NOME.  "3 parcelas de alunos
//     diferente mas o valor esta unificado" gravou ALUNO = "diferente mas o
//     valor esta unificado." (Recreio 05/09 12:45). Outros dois em 3 dias:
//     "Sao dois curso teclado e" (Recreio 03/09) e "Maria Luzia ... e a parcela
//     e" (CG 05/09). `\balun[oa]s?\b` aceitava o PLURAL — que significa o
//     oposto de etiqueta de um nome — e o grupo do rotulo era OPCIONAL, entao
//     "aluno" + prosa virava nome. Mesma licao ja registrada no CLAUDE.md:
//     palavra solta nunca e comando.
//
// F4  CANDIDATO REPETIDO.  Card da Kamilly (CG 05/09 13:51) listou
//     "- Kamilly Azevedo da Silva" TRES vezes: sao 3 MATRICULAS da mesma pessoa
//     e a lista nao deduplicava. Perguntar "e de qual aluno?" oferecendo o mesmo
//     nome 3x nao e pergunta, e ruido.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-forma-pix-e-nome-05set.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error('ANCORA "' + rotulo + '": esperava ' + esperado + ', achei ' + n); process.exit(1); }
  src = src.split(de).join(para);
  console.log('  ok  ' + rotulo);
}

// ── F1: pix explicito vence debito solto ────────────────────────────────────
trocar(
  String.raw`function extrairCartao(text) {
  const t = String(text || '');
  if (!SINAL_CARTAO.test(t)) return null;`,
  String.raw`// Sinal de maquininha que NAO depende da palavra solta "debito"/"credito".
// Cupom de cartao carrega bandeira, NSU ou adquirente; comprovante de Pix nao.
const SINAL_CARTAO_FORTE = /(\bvisa\b|master(?:card)?|elo\b|amex|hipercard|\bnsu\b|pagbank|cielo|stone|getnet|rede\b|autorizado com senha|venda\s+cr[eé]dito|venda\s+d[eé]bito|cart[aã]o\s+(?:de\s+)?(?:cr[eé]dito|d[eé]bito))/i;
function extrairCartao(text) {
  // "Debito em conta" / "credito em conta corrente" e' lancamento BANCARIO, nao
  // maquininha — sai do texto antes de qualquer teste de sinal de cartao.
  const t = String(text || '').replace(/\b(d[eé]bito|cr[eé]dito)\s+(?:em|na|no|de|da|do)\s+(?:c\/c|conta|cc)\b/gi, ' ');
  if (!SINAL_CARTAO.test(t)) return null;
  // 🔴 PIX EXPLICITO VENCE. Comprovante de Pix diz "Debito em conta" e o
  // SINAL_CARTAO aceita a palavra sozinha — foi assim que 6 comprovantes de pix
  // viraram "cartao debito" em 3 dias (03-05/09/2026). Sinal FORTE de
  // maquininha continua valendo mesmo com "pix" no texto: cupom nunca diz pix.
  if (/\bpix\b/i.test(t) && !SINAL_CARTAO_FORTE.test(t)) return null;`,
  'F1a extrairCartao: pix explicito e debito-em-conta');

trocar(
  String.raw`        if (!forma) { const ff = extrairForma(ocrText, null); if (ff) forma = ff; }
        const cc = extrairCartao(ocrText);`,
  String.raw`        if (!forma) { const ff = extrairForma(ocrText, null); if (ff) forma = ff; }
        // ⚠️ Este ramo SOBRESCREVE a forma sem olhar o que ja foi lido. Com pix
        // explicito no comprovante, so sinal FORTE de maquininha desbanca — e
        // nesse caso extrairCartao ja devolve null (F1a, 05/09/2026).
        const cc = extrairCartao(ocrText);`,
  'F1b OCR: a precedencia fica escrita');

// ── F2: a linha "Nome R$ valor" passa a ter UMA regra so ────────────────────
trocar(
  String.raw`function detectarContextoMultiAluno(texto) {`,
  String.raw`// A LINHA "Nome — R$ valor" TEM UMA REGRA SO. Ela e' lida em dois lugares (o
// detector, que decide se e' multi, e o parser, que extrai os itens); ate 05/09
// eram duas copias da mesma regex, com o mesmo defeito nas duas.
//   · APOSTROFO E PONTO entram no nome: Sant'Anna, D'Angelo, Jr. — recusa-los
//     derrubou 2 dos 3 alunos do lote da Vitoria (Recreio 05/09).
//   · O TRACO E' OPCIONAL quando o valor traz "R$". A equipe escreve "Marcio
//     Sant'Anna R$395,00"; exigir o travessao que a Sol ENSINA e' exigir um
//     caractere que nao existe no teclado do celular.
//   · Sem traco o "R$" e' OBRIGATORIO — e' ele que marca a fronteira e impede
//     que "Parcela 3 12 395,00" vire nome de aluno.
const _TOKEN_NOME_SOL = "[a-zà-ÿA-ZÀ-Ý][a-zà-ÿA-ZÀ-Ý.'’]+";
const _RE_LINHA_NOME_VALOR = new RegExp(
  "^\\s*(" + _TOKEN_NOME_SOL + "(?:\\s+" + _TOKEN_NOME_SOL + "){1,4})" +
  "\\s*(?:[-–—]\\s*(?:r\\$\\s*)?|r\\$\\s*)(\\d[\\d.,]*)\\s*$", "i");
// Rotulo de operacao no inicio da linha nunca e' nome de gente. Sem isto,
// "Passaporte do Canto R$400" viraria um "aluno" chamado Passaporte do Canto.
const _RE_NAO_E_NOME_NA_LINHA = /^(?:parcelas?|passaportes?|taxas?|total|subtotal|valor(?:es)?|matr[ií]culas?|mensalidades?|pagamentos?|recebidos?|entradas?|sa[ií]das?|descontos?|multa|juros)\b/i;
// Devolve { nome, valor } quando a linha e' "Nome — R$ valor"; senao null.
function _linhaNomeValorSol(linha) {
  const m = String(linha || '').match(_RE_LINHA_NOME_VALOR);
  if (!m) return null;
  const nome = m[1].replace(/\s+/g, ' ').trim();
  if (_RE_NAO_E_NOME_NA_LINHA.test(nome)) return null;
  const valor = parseBRMoney(m[2]);
  if (!valor || valor <= 0) return null;
  return { nome, valor };
}

function detectarContextoMultiAluno(texto) {`,
  'F2a regra unica da linha Nome/valor');

trocar(
  String.raw`  const linhasNomeValor = (String(texto || '').split(/\n/)
    .map((l) => l.match(/^\s*([a-zà-ÿA-ZÀ-ÿ]{2,}(?:\s+[a-zà-ÿA-ZÀ-ÿ]{2,}){1,4})\s*[-–—]\s*r?\$?\s*\d[\d.,]*\s*$/i))
    .filter((m) => m && !_UNIDADE_TAG.test(m[1]))
  ).length >= 2;`,
  String.raw`  const linhasNomeValor = (String(texto || '').split(/\n/)
    .map(_linhaNomeValorSol)
    .filter((x) => x && !new RegExp(_UNIDADE_TAG.source, 'i').test(x.nome))
  ).length >= 2;`,
  'F2b detector usa a regra unica');

trocar(
  String.raw`  const unidadeRe = new RegExp(_UNIDADE_TAG.source, 'i');
  const itens = []; let totalDeclarado = null;
  for (const l of String(texto || '').split(/\n/)) {
    const m = l.match(/^\s*([a-z\u00e0-\u00ffA-Z\u00c0-\u00ff]{2,}(?:\s+[a-z\u00e0-\u00ffA-Z\u00c0-\u00ff]{2,}){1,4})\s*[-\u2013\u2014]\s*(r?\$?\s*\d[\d.,]*)\s*$/i);
    if (!m) continue;
    const nome = m[1].replace(/\s+/g, ' ').trim();
    const v = parseBRMoney(m[2]);
    if (!v || v <= 0) continue;
    if (unidadeRe.test(nome)) { totalDeclarado = v; continue; }
    if (!nomePlausivel(nome)) continue;
    itens.push({ aluno_nome: nome, valor: v });
  }`,
  String.raw`  const unidadeRe = new RegExp(_UNIDADE_TAG.source, 'i');
  const itens = []; let totalDeclarado = null;
  for (const l of String(texto || '').split(/\n/)) {
    const m = _linhaNomeValorSol(l);
    if (!m) continue;
    if (unidadeRe.test(m.nome)) { totalDeclarado = m.valor; continue; }
    if (!nomePlausivel(m.nome)) continue;
    itens.push({ aluno_nome: m.nome, valor: m.valor });
  }`,
  'F2c parser usa a regra unica');

// ── F3: plural nao rotula nome, frase nao e nome ────────────────────────────
trocar(
  String.raw`  const m = t.match(/\balun[oa]s?\s*(?:([:\-])\s*|(?:e|é|foi)\s+)?([A-Za-z\u00c0-\u00ff][A-Za-z\u00c0-\u00ff.'\s]{2,80})/i);
  if (!m) return null;`,
  String.raw`  // 🔴 SO O SINGULAR ROTULA. "alunos" significa MAIS DE UM — e' o oposto de
  // etiqueta de UM nome. Com o plural aceito, "3 parcelas de alunos diferente
  // mas o valor esta unificado" gravou o ALUNO como "diferente mas o valor
  // esta unificado." (Recreio 05/09 12:45). O \b depois de alun[oa] recusa o
  // plural; o fluxo multi-aluno e quem trata mensagem com varios nomes.
  const m = t.match(/\balun[oa]\b\s*(?:([:\-])\s*|(?:e|é|foi)\s+)?([A-Za-z\u00c0-\u00ff][A-Za-z\u00c0-\u00ff.'\s]{2,80})/i);
  if (!m) return null;`,
  'F3a _alunoRotulado: o plural nao rotula');

// 🔴 A ORDEM IMPORTA: julgar a captura CRUA rejeitava tambem o caso bom
// ("aluna Maria Luzia ... e a parcela e de setembro"), porque o rabo da frase
// esta dentro dela. O corte (F3b) roda primeiro; o vocabulario julga o que
// SOBROU. Sobrou frase => nao era nome nenhum.
trocar(
  String.raw`  // "aluno: Starline" — rotulo com dois-pontos e' ditado deliberado: aceita
  // nome de um token (banda/mononimo). Sem o dois-pontos, a regra dos 2 fica.
  return _limparAlunoRotulado(m[2], { minTokens: m[1] ? 1 : 2 });`,
  String.raw`  // "aluno: Starline" — rotulo com dois-pontos e' ditado deliberado: aceita
  // nome de um token (banda/mononimo). Sem o dois-pontos, a regra dos 2 fica.
  const _nome = _limparAlunoRotulado(m[2], { minTokens: m[1] ? 1 : 2 });
  // 🔴 FRASE NAO E' NOME. Se depois da limpeza ainda sobra vocabulario de
  // operacao, a pessoa estava falando DO LANCAMENTO e nao ditando um nome:
  // "o aluno e a parcela e de setembro" gravava ALUNO = "parcela e de setembro".
  if (_nome && _META_DEPOIS_DE_ALUNO.test(_nome)) return null;
  return _nome;`,
  'F3a2 vocabulario julga o nome JA limpo');

// ⚠️ `_META_DEPOIS_DE_ALUNO` nasce DEPOIS de META_NAO_E_NOME_RE, nao antes:
// META e' `const` declarado abaixo de `_alunoRotulado`, entao um `new RegExp`
// colocado acima executaria na carga do modulo e estouraria TDZ.
trocar(
  String.raw`const META_NAO_E_NOME_RE = /\b(descri[cç][aã]o|categoria|despesa|sa[ií]da|entrada|retirada|troco|forma|valor|corrig|corre[cç][aã]o|lan[cç]|altera|muda|troca|confirma|pode|n[aã]o\s+e|cofre|caixa)\b/i;`,
  String.raw`const META_NAO_E_NOME_RE = /\b(descri[cç][aã]o|categoria|despesa|sa[ií]da|entrada|retirada|troco|forma|valor|corrig|corre[cç][aã]o|lan[cç]|altera|muda|troca|confirma|pode|n[aã]o\s+e|cofre|caixa)\b/i;
// Vocabulario que, logo depois de "aluno", prova que a frase fala DO
// LANCAMENTO e nao dita um nome. Reusa META (fonte unica) e acrescenta os
// substantivos do dominio — duas listas soltas divergiriam com o tempo.
const _META_DEPOIS_DE_ALUNO = new RegExp(
  META_NAO_E_NOME_RE.source + '|\\b(parcelas?|compet[eê]ncias?|competencias?|mensalidades?|faturas?|cursos?|turmas?|matr[ií]culas?|passaportes?|m[eê]s|meses)\\b',
  'i');`,
  'F3c vocabulario de operacao depois de "aluno"');

trocar(
  String.raw`  n = n.replace(/\s+(?:e|eh|é)?\s*(?:o|a)?\s*respons[aá]vel(?:\s+financeir[oa])?\b[\s\S]*$/i, ' ');`,
  String.raw`  n = n.replace(/\s+(?:e|eh|é)?\s*(?:o|a)?\s*respons[aá]vel(?:\s+financeir[oa])?\b[\s\S]*$/i, ' ');
  // Mesmo corte, outro campo: "Maria Luzia Marinho da Silva Delgado e a parcela
  // é" virou nome inteiro, com o rabo da frase colado (CG 05/09 11:59).
  n = n.replace(/\s+e\s+(?:a|o)\s+(?:parcela|compet[eê]ncia|competencia|forma|categoria|fatura|mensalidade|turma|data)\b[\s\S]*$/i, ' ');`,
  'F3b corte do rabo da frase');

// ── F4: candidato repetido ──────────────────────────────────────────────────
trocar(
  String.raw`                candidatosAluno = idp.alunos.map((x) => x.aluno_nome).slice(0, 4);`,
  String.raw`                // Uma PESSOA com 3 cursos sao 3 MATRICULAS: a lista repetia o
                // mesmo nome 3x e a pergunta "e' de qual aluno?" virava ruido
                // (Kamilly Azevedo da Silva, CG 05/09 13:51).
                candidatosAluno = [...new Set(idp.alunos.map((x) => x.aluno_nome))].slice(0, 4);`,
  'F4 dedup dos candidatos');

fs.writeFileSync(alvo, src);
console.log('\nescrito ' + alvo + '  (' + antes + ' -> ' + src.length + ' bytes)');
