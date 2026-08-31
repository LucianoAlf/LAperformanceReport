#!/usr/bin/env node
// Caso Kailane/Barra 31/08 16:28-16:31 — a Sol repetiu 3x um card com a fatura
// ERRADA e, quando corrigida, piorou o card.
//
// R-h  A PALAVRA "PARCELA" SOLTA NAO E' COMANDO. A condicao do bloco de
//      correcao de categoria tinha `\bparcela\b` como ALTERNATIVA — entao
//      "A parcela nao esta vencida, sera apenas mes que vem" virou "Ajustei: a
//      categoria e parcela" e DESTRUIU a categoria correta (passaporte).
//      Mesmo padrao do "vale" (31/08 manha): palavra solta tratada como comando.
//
// R-i  CONTESTACAO DE FATURA e' gramatica que nao existia. Quando a equipe diz
//      que a fatura casada esta errada/desatualizada ("nao esta vencida", "ja
//      foi corrigido no sistema", "TA ERRADO"), a Sol SOLTA a fatura e remonta
//      o card sem o bloco de atraso/multa, em vez de repetir o mesmo card.
//      ⚠️ Ela nao re-casa sozinha: fatura contestada vira lancamento SEM
//      vinculo, que e' o conservador — vincular errado suja a carteira.
//
// (A raiz da ESCOLHA da fatura esta na migration 20260831210000: valor exato do
// comprovante passa a vencer o "mais atrasada" na RPC canonica.)
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-fatura-contestada-31ago.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;
const BS = String.fromCharCode(92);   // `\b` em template string vira BACKSPACE

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── R-i: detector de contestacao de fatura ───────────────────────────────────
trocar(
  'function _semAlunoDeclarado(body) {',
  `// A equipe contesta a FATURA que a Sol casou: "a parcela nao esta vencida",
// "ja foi corrigido no sistema", "TA ERRADO". Antes isso nao era gramatica
// nenhuma — a Sol respondia com o MESMO card (Kailane/Barra 31/08, 3x).
function _contestaFatura(body) {
  const n = _normConf(body);
  if (!n) return false;
  if (n.length > 200) return false;
  const negaVencimento = /(nao\\s+(?:esta|ta|e)\\s+vencid|nao\\s+venceu|ainda\\s+nao\\s+venceu|nao\\s+vence[u]?\\s+ainda|vence\\s+(?:so\\s+)?(?:mes\\s+que\\s+vem|no\\s+proximo|proximo\\s+mes)|sera\\s+(?:apenas\\s+)?mes\\s+que\\s+vem|e\\s+do\\s+mes\\s+que\\s+vem)/.test(n);
  const erroFatura = /((?:ta|esta)\\s+errad|nao\\s+e\\s+(?:essa|esse|essa\\s+parcela|essa\\s+fatura)|fatura\\s+errad|parcela\\s+errad)/.test(n);
  const corrigidoLa = /(ja\\s+(?:foi\\s+)?corrigid|ja\\s+corrigi|ja\\s+(?:foi\\s+)?ajustad|ja\\s+atualiz)/.test(n) && /(sistema|emusys)/.test(n);
  return negaVencimento || erroFatura || corrigidoLa;
}

function _semAlunoDeclarado(body) {`,
  'R-i detector _contestaFatura');

// ── R-h: "parcela" solta deixa de ser comando + contestacao tem precedencia ──
trocar(
  "        if (alvoP && !/n[aã]o\\s+(?:e|é|eh)\\s+parcela/i.test(txt) && /categor(?:ia)?\\s+(?:e|é|eh)\\s+parcela|(?:nao|não)\\s+(?:e|é|eh)\\s+lojinha.*parcela|(?:e|é|eh)\\s+mensalidade|\\bparcela\\b/i.test(txt) && !adicional) {",
  "        // ⚠️ `" + BS + "bparcela" + BS + "b` SOLTO saiu daqui (31/08): qualquer frase que citasse a\n"
  + "        // palavra virava \"a categoria e parcela\" — foi assim que \"A parcela nao\n"
  + "        // esta vencida\" destruiu a categoria passaporte, correta, da Kailane.\n"
  + "        // Agora exige forma de COMANDO: rotulo, verbo, ou ditado que ABRE a\n"
  + "        // mensagem (\"Parcela 08/2026\").\n"
  + "        const _cmdParcela = /categor(?:ia)?" + BS + "s+(?:e|é|eh)" + BS + "s+parcela|(?:nao|não)" + BS + "s+(?:e|é|eh)" + BS + "s+lojinha.*parcela|(?:e|é|eh)" + BS + "s+mensalidade"
  + "|(?:e|é|eh|como|lanca|lança|coloca|marca|muda|troca|poe|põe)" + BS + "s+(?:a" + BS + "s+)?parcela" + BS + "b"
  + "|^" + BS + "s*parcela" + BS + "b|" + BS + "bparcela" + BS + "s+" + BS + "d{1,2}" + BS + "s*[/-]" + BS + "s*" + BS + "d{2,4}/i;\n"
  + "        if (alvoP && !/n[aã]o\\s+(?:e|é|eh)\\s+parcela/i.test(txt) && _cmdParcela.test(txt) && !_contestaFatura(txt) && !adicional) {",
  'R-h parcela solta deixa de ser comando');

// ── R-i: bloco de contestacao (antes do sem-aluno, que ja e' cedo no fluxo) ──
trocar(
  `        // ── "e' de banda / nao tem aluno especifico": receita sem aluno ─────`,
  `        // ── contestacao da FATURA casada: solta e remonta sem atraso/multa ──
        if (_contestaFatura(txt)) {
          const _citaFC = (x, id) => x.previewId === id || x.origem === id || (Array.isArray(x.msgIds) && x.msgIds.includes(id));
          let alvoFC = null;
          if (event.quotedMessageId) alvoFC = arrP.find((x) => _citaFC(x, event.quotedMessageId)) || null;
          if (!alvoFC && arrP.length === 1) alvoFC = arrP[0];
          if (alvoFC && (alvoFC.canonica || alvoFC.parcela || alvoFC.composto)) {
            alvoFC.canonica = null; alvoFC.parcela = null; alvoFC.composto = null;
            alvoFC.faturaContestada = true;
            alvoFC.bloqueiaLancamento = false;
            alvoFC.faturaIndisponivel = false;
            alvoFC.bloqueiaFonteIndisponivel = false;
            alvoFC.confirmacaoManualFonte = true;
            alvoFC.descricao = _descricaoLancamento(alvoFC.categoria, alvoFC.competencia, alvoFC.aluno, null);
            alvoFC.ts = agora;
            let textoFC = 'Ok — soltei a fatura que eu tinha casado (não vou usar os dados dela). Confere assim:\\n\\n' + montarPreview({
              unidadeNome: alvoFC.nome, valor: alvoFC.valor, forma: alvoFC.forma,
              categoria: alvoFC.categoria, aluno: alvoFC.aluno, competencia: alvoFC.competencia,
              parcela: null, confiancaBaixa: false, responsavelFinanceiro: alvoFC.responsavelFinanceiro,
              formaIncerta: alvoFC.formaIncerta, cartaoModalidade: alvoFC.cartaoModalidade,
              cartaoParcelas: alvoFC.cartaoParcelas, multiplas: false,
              alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
              canonica: null, duplicata: null, quitacao: alvoFC.quitacao, faturaIndisponivel: false,
              composto: null, bloqueiaLancamento: false,
              semAlunoDeclarado: alvoFC.semAluno, entidade: alvoFC.entidade,
            });
            if (dryRun) textoFC += '\\n\\n_(modo teste — nada será gravado no caixa)_';
            alvoFC.previewId = await sendFn(chatId, textoFC);
            (alvoFC.msgIds = alvoFC.msgIds || []).push(alvoFC.previewId);
            alvoFC.toquePor = String(event.senderPhone || event.senderId || '') || alvoFC.toquePor;
            alvoFC.toqueTs = agora;
            if (!await vincularPreviewRemontadoV3({
              event, grupo: grp, pendencia: alvoFC, previewId: alvoFC.previewId, texto: textoFC,
              result: { acao: 'preview_fatura_contestada', categoria: alvoFC.categoria },
            })) return { acao: 'preview_fatura_contestada_sem_v3' };
            log({ acao: 'preview_fatura_contestada', chatId, categoria: alvoFC.categoria });
            return { acao: 'preview_fatura_contestada' };
          }
        }

        // ── "e' de banda / nao tem aluno especifico": receita sem aluno ─────`,
  'R-i bloco de contestacao');

// ── derivarVinculo nao pode vincular fatura contestada ───────────────────────
trocar(
  '      const vinculo = derivarVinculo(alvo);',
  `      const vinculo = derivarVinculo(alvo);
      // Fatura contestada pela equipe nao volta pela porta dos fundos: vincular
      // a fatura errada suja a carteira do aluno (pior que lancar sem vinculo).
      if (alvo.faturaContestada) { vinculo.fatura_id = null; vinculo.fonte = 'fatura_contestada'; }`,
  'R-i derivarVinculo respeita contestacao');

// ── R-h2: guardar a categoria de ANTES da fatura, para poder voltar ─────────
// A categoria da fatura canonica sobrescreve a interpretada (contrato v4, e esta
// certo quando a fatura esta certa). Mas com a fatura ERRADA isso apagou o
// "passaporte" que o interpretador acertou pela legenda (Kailane 31/08). Guardar
// o valor anterior e restaura-lo quando a equipe contesta a fatura.
trocar(
  `      const catCanonica = categoriaDaFatura(canonica);
      if (catCanonica) categoria = catCanonica;`,
  `      const catCanonica = categoriaDaFatura(canonica);
      const _categoriaAntesDaFatura = categoria;
      if (catCanonica) categoria = catCanonica;`,
  'R-h2 guarda categoria pre-fatura');

trocar(
  `      const pendencia = { previewId, unidade_id: grp.unidade_id, nome: grp.nome, valor, forma, categoria, aluno, competencia, descricao, parcela, responsavelFinanceiro, cartaoModalidade, cartaoParcelas, formaIncerta, quitacao, multiplas, composto, canonica, alunoNovoId, itemLojinha: lojinhaInfo && lojinhaInfo.item, bloqueiaLancamento, faturaIndisponivel: canonicaIndisponivel, bloqueiaFonteIndisponivel, enviadoPor: nomeParaCarimbo(idEnviou, event), idemKey, origem: event.messageId,`,
  `      const pendencia = { previewId, unidade_id: grp.unidade_id, nome: grp.nome, valor, forma, categoria, aluno, competencia, descricao, parcela, responsavelFinanceiro, cartaoModalidade, cartaoParcelas, formaIncerta, quitacao, multiplas, composto, canonica, alunoNovoId, itemLojinha: lojinhaInfo && lojinhaInfo.item, bloqueiaLancamento, faturaIndisponivel: canonicaIndisponivel, bloqueiaFonteIndisponivel, categoriaInterpretada: _categoriaAntesDaFatura || null, enviadoPor: nomeParaCarimbo(idEnviou, event), idemKey, origem: event.messageId,`,
  'R-h2 pendencia carrega categoriaInterpretada');

trocar(
  `            alvoFC.faturaContestada = true;`,
  `            alvoFC.faturaContestada = true;
            // A categoria tinha vindo da fatura contestada; volta para a que o
            // interpretador leu da legenda/OCR (passaporte, no caso real).
            if (alvoFC.categoriaInterpretada && alvoFC.categoriaInterpretada !== alvoFC.categoria) {
              log({ acao: 'categoria_restaurada_pos_contestacao', chatId, de: alvoFC.categoria, para: alvoFC.categoriaInterpretada });
              alvoFC.categoria = alvoFC.categoriaInterpretada;
            }`,
  'R-h2 restaura categoria na contestacao');

// ── exports ──────────────────────────────────────────────────────────────────
trocar(
  '  _ehDitadoDeCaixa, classificarCorrecaoPendencia, listarPreviewsAbertosV3,',
  '  _ehDitadoDeCaixa, classificarCorrecaoPendencia, listarPreviewsAbertosV3, _contestaFatura,',
  'export _contestaFatura');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
