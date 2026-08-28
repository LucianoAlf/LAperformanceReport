#!/usr/bin/env node
// Compra/despesa vira SAÍDA de caixa. Antes era impossível lançar.
//
// CASO (Rose + Vitória, Recreio, 28/08/2026, R$ 34,00 de 2 refrigerantes):
// três tentativas, nenhuma funcionou. A Sol devolvia RECEBIMENTO e pedia aluno.
//
// 🔴 CAUSA-RAIZ: nenhuma categoria de saída além de `seguranca` era alcançável a
// partir da legenda. `_categoriaFromCaption` e `_categoriaExplicitaFromCaption`
// **não tinham uma única regra** que devolvesse 'despesa'/'retirada'/'troco' —
// e a primeira ainda cai em 'parcela' por padrão. `categoriaEhSaida` aceita os
// quatro valores, mas ninguém nunca produzia três deles. Na prática: comprar
// refrigerante, material, lanche ou pagar um Uber era impossível de registrar, e
// a equipe não tinha palavra que resolvesse — porque não existia palavra.
//
// Agravante: a categoria do LLM ('lojinha' na 1ª tentativa, 'outro' na 3ª) era
// usada como valor inicial e a legenda humana só entrava como FALLBACK (`||`),
// então mesmo escrevendo "Despesa (saída)" o palpite do modelo vencia.
//
// ⚠️ A detecção sai da LEGENDA, nunca do OCR. O cupom fiscal da compra contém
// "COMPRA", "PAGAMENTO" e "TROCO" no corpo; ler dali transformaria todo
// comprovante em saída. É a mesma armadilha do "Chave de segurança" no rodapé do
// PDF do Santander, que já virou parcela-de-aluna-como-saída-de-cofre em 24/08.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-saida-despesa-compra.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── 1. o detector que faltava ────────────────────────────────────────────────
trocar(
  `function _categoriaFromCaption(body) {`,
  `// Palavras com que a equipe diz que o dinheiro SAIU. Só valem no que o HUMANO
// escreveu — nunca no OCR (o cupom da compra tem COMPRA/PAGAMENTO/TROCO no corpo).
const SAIDA_TERMO_RE = /\\b(despesas?|desembolso|reembolso|sa[ií]das?|retirad[ao]s?|retirei|compra(?:mos|ram)?|comprei|paguei|pagamos|gastei|gastos?|vale)\\b/i;

// Devolve a categoria de SAIDA declarada na legenda, ou null.
// ⚠️ Recebimento de aluno nunca e' saida, mesmo com verbo de compra na frase
// ("o responsavel pagou a parcela"): parcela/mensalidade/passaporte/matricula
// desqualificam antes de qualquer termo.
function _saidaExplicitaFromCaption(body) {
  const t = bodyLimpo(body);
  if (!t) return null;
  if (/\\b(parcela|mensalidade|passaporte|matr[ií]cula)\\b/i.test(t)) return null;
  if (/\\btroco\\b/i.test(t)) return 'troco';
  if (/\\b(retirad[ao]s?|retirei)\\b/i.test(t)) return 'retirada';
  if (SAIDA_TERMO_RE.test(t)) return 'despesa';
  return null;
}

function _categoriaFromCaption(body) {`,
  'funcao _saidaExplicitaFromCaption');

// ── 2. no fluxo COM MIDIA: a legenda humana vence o palpite do LLM ───────────
trocar(
  `      if (categoriaExplicita === 'parcela') categoria = 'parcela';
      else if (categoriaExplicita === 'seguranca') categoria = 'seguranca';`,
  `      // SAIDA declarada na legenda manda em tudo — inclusive no palpite do LLM,
      // que aqui ja veio como 'lojinha'/'outro'. Fica ANTES de lojinha de proposito:
      // "compra de 2 refrigerantes" tem produto, mas e' despesa, nao venda.
      // ⚠️ legendaEfetiva, NAO textoClassificacao: este ultimo carrega o OCR.
      const _catSaidaLegenda = _saidaExplicitaFromCaption(legendaEfetiva);
      if (_catSaidaLegenda) categoria = _catSaidaLegenda;
      else if (categoriaExplicita === 'parcela') categoria = 'parcela';
      else if (categoriaExplicita === 'seguranca') categoria = 'seguranca';`,
  'saida vence no fluxo de midia');

// ── 3. no fluxo SO TEXTO: idem ───────────────────────────────────────────────
trocar(
  `      const categoriaTexto = _categoriaExplicitaFromCaption(texto);`,
  `      const categoriaTexto = _saidaExplicitaFromCaption(texto) || _categoriaExplicitaFromCaption(texto);`,
  'saida por texto puro');

// ── 4. nome tardio nao engole frase de comando/correcao ──────────────────────
// "Sol, descricao e: 2 refrigerantes / Pode" virou aluno "descricao e refrigerantes
// Pode" no caso real. Vocabulario de META (falar SOBRE o lancamento) nunca e nome.
trocar(
  `function _nomeHumanoTardio(body) {
  const rotulado = _alunoRotulado(body);
  if (rotulado) return rotulado;`,
  `const META_NAO_E_NOME_RE = /\\b(descri[cç][aã]o|categoria|despesa|sa[ií]da|entrada|retirada|troco|forma|valor|corrig|corre[cç][aã]o|lan[cç]|altera|muda|troca|confirma|pode|n[aã]o\\s+e|cofre|caixa)\\b/i;

function _nomeHumanoTardio(body) {
  const rotulado = _alunoRotulado(body);
  if (rotulado) return rotulado;
  // Quem fala SOBRE o lancamento nao esta dizendo um nome de aluno.
  if (META_NAO_E_NOME_RE.test(bodyLimpo(body))) return null;`,
  'nome tardio recusa frase de comando');

// ── 5. exporta para o teste ──────────────────────────────────────────────────
trocar(
  `  parseBRMoney, extrairValor, extrairForma, detectarComprovante, casarPode,`,
  `  parseBRMoney, extrairValor, extrairForma, detectarComprovante, casarPode,
  _saidaExplicitaFromCaption, _nomeHumanoTardio,`,
  'exporta detector e nome tardio');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
