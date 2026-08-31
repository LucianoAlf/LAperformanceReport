#!/usr/bin/env node
// Caso Mayra/CG 31/08 17:23 — "R$387,00" virou "R$ 38.700,00" no card.
//
// R-j  A LEGENDA HUMANA COM R$ EXPLICITO VENCE O OCR. O tesseract perde a
//      virgula ("387,00" -> "38700") e o backfill da legenda-irma era
//      `if (!valor)` — como o OCR ja tinha preenchido ERRADO, o R$387,00
//      escrito pela Mayra nao vencia. E' a doutrina "rotulo humano vence OCR
//      ruim" aplicada ao valor.
//
// R-k  CORRECAO DITADA DE VALOR nao era gramatica: "Sol, o valor foi R$387,00"
//      citando o card levou "Nao entendi essa" (e o fallback LLM classificou
//      sem_intencao — ganhou exemplos no prompt). Agora o rotulo "valor" +
//      numero atualiza a pendencia, recalcula valor_bate e remonta o card.
//      ⚠️ Mensagem com rotulo de ALUNO junto ("a aluna e X e o valor e Y")
//      continua no caminho do nome — nao roubar a correcao composta.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-valor-legenda-e-ditado-31ago.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;
const BS = String.fromCharCode(92);   // `\b` em template string vira BACKSPACE

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── R-j: legenda com R$ explicito vence o valor do OCR ───────────────────────
trocar(
  `      const somaLegenda = extrairSomaAditivaPagamento(legendaEfetiva);`,
  `      // R-j (31/08): a legenda humana com R$ explicito VENCE o valor do OCR.
      // O tesseract perdeu a virgula ("387,00" -> "38700") e o card nasceu com
      // R$ 38.700,00 tendo "R$387,00" escrito pela Mayra na legenda-irma — o
      // backfill era só \`if (!valor)\`, entao o OCR errado ganhava do humano.
      {
        const _vLegenda = extrairValor(legendaEfetiva);
        if (_vLegenda && valor && Math.abs(_vLegenda - valor) >= 0.01) {
          log({ acao: 'valor_da_legenda_vence_ocr', chatId, ocr: valor, legenda: _vLegenda });
          valor = _vLegenda;
        }
      }
      const somaLegenda = extrairSomaAditivaPagamento(legendaEfetiva);`,
  'R-j legenda vence OCR');

// ── R-k: correcao ditada de valor (antes da categoria ditada) ────────────────
trocar(
  `        // ── correcao ditada de categoria SEM aprovacao ("coloca a categoria`,
  `        // ── correcao ditada de VALOR ("Sol, o valor foi R$387,00") ──────────
        // (31/08: nao era gramatica; a Mayra citou o card e levou "Nao entendi".)
        // Rotulo "valor" + numero e' forma de comando; nome junto ("a aluna e X
        // e o valor e Y") fica com o caminho do nome, que trata os dois.
        const _valorDitado = (() => {
          if (_alunoRotulado(txt)) return null;
          const m = _normConf(txt).match(/` + BS + `bvalor` + BS + `b` + BS + `s*(?:foi|e|eh|era|correto(?:` + BS + `s+e)?|de)?` + BS + `s*[:-]?` + BS + `s*(?:r` + BS + `$)?` + BS + `s*(` + BS + `d[` + BS + `d.,]*)/);
          if (!m) return null;
          const v = parseBRMoney(m[1]);
          return v && v > 0 ? v : null;
        })();
        if (_valorDitado) {
          const _citaVD = (x, id) => x.previewId === id || x.origem === id || (Array.isArray(x.msgIds) && x.msgIds.includes(id));
          let alvoVD = null;
          if (event.quotedMessageId) alvoVD = arrP.find((x) => _citaVD(x, event.quotedMessageId)) || null;
          if (!alvoVD && arrP.length === 1) alvoVD = arrP[0];
          if (alvoVD && !categoriaEhSaida(alvoVD.categoria) && Math.abs((alvoVD.valor || 0) - _valorDitado) >= 0.01) {
            log({ acao: 'preview_valor_corrigido', chatId, de: alvoVD.valor || null, para: _valorDitado });
            alvoVD.valor = _valorDitado;
            if (alvoVD.parcela && alvoVD.parcela.valor_da_parcela != null) {
              alvoVD.parcela.valor_bate = Math.abs(Number(alvoVD.parcela.valor_da_parcela) - _valorDitado) < 0.01;
            }
            alvoVD.bloqueiaLancamento = !alvoVD.composto && alvoVD.parcela && alvoVD.parcela.multiplas_no_mes && alvoVD.parcela.valor_bate === false;
            alvoVD.ts = agora;
            let textoVD = 'Corrigi o valor:\\n\\n' + montarPreview({
              unidadeNome: alvoVD.nome, valor: alvoVD.valor, forma: alvoVD.forma,
              categoria: alvoVD.categoria, aluno: alvoVD.aluno, competencia: alvoVD.competencia,
              parcela: alvoVD.parcela, confiancaBaixa: false, responsavelFinanceiro: alvoVD.responsavelFinanceiro,
              formaIncerta: alvoVD.formaIncerta, cartaoModalidade: alvoVD.cartaoModalidade,
              cartaoParcelas: alvoVD.cartaoParcelas, multiplas: alvoVD.multiplas,
              alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
              canonica: alvoVD.canonica, duplicata: null, quitacao: alvoVD.quitacao,
              faturaIndisponivel: alvoVD.faturaIndisponivel, composto: alvoVD.composto,
              bloqueiaLancamento: alvoVD.bloqueiaLancamento,
              semAlunoDeclarado: alvoVD.semAluno, entidade: alvoVD.entidade,
            });
            if (dryRun) textoVD += '\\n\\n_(modo teste — nada será gravado no caixa)_';
            alvoVD.previewId = await sendFn(chatId, textoVD);
            (alvoVD.msgIds = alvoVD.msgIds || []).push(alvoVD.previewId);
            alvoVD.toquePor = String(event.senderPhone || event.senderId || '') || alvoVD.toquePor;
            alvoVD.toqueTs = agora;
            if (!await vincularPreviewRemontadoV3({
              event, grupo: grp, pendencia: alvoVD, previewId: alvoVD.previewId, texto: textoVD,
              result: { acao: 'preview_valor_corrigido', valor: _valorDitado },
            })) return { acao: 'preview_valor_corrigido_sem_v3' };
            return { acao: 'preview_valor_corrigido', valor: _valorDitado };
          }
        }

        // ── correcao ditada de categoria SEM aprovacao ("coloca a categoria`,
  'R-k correcao ditada de valor');

// ── fallback LLM: exemplos no prompt (classificou sem_intencao no caso real) ─
trocar(
  `      + 'NUNCA invente nome ou valor que nao esteja na mensagem.\\n\\nMENSAGEM:\\n' + t.slice(0, 800);`,
  `      + 'NUNCA invente nome ou valor que nao esteja na mensagem. '
      + 'Exemplos: "Sol, o valor foi R\\$387,00" => corrigir_valor com valor 387.00; '
      + '"nao e esse aluno, e o Joao Silva" => corrigir_aluno; "isso e venda" => corrigir_categoria; '
      + '"foi no dinheiro" => corrigir_forma.\\n\\nMENSAGEM:\\n' + t.slice(0, 800);`,
  'exemplos no prompt do classificador');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
