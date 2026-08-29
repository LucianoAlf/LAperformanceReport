#!/usr/bin/env node
// Caso Arthur/Barra 29/08 10:33-10:39: venda de UMA camisa (R$65, cartao) virou
// "comprovante de mais de um aluno" — e quando ele explicou com todas as letras
// ("venda de camisa para o aluno Theo de bem, 65 reais"), o fluxo multi exigiu
// "os dois" PARA SEMPRE. Nao existia saida da armadilha. O interpretador tinha
// acertado a categoria (lojinha, no log) e nada disso importou.
//
// TRES CORRECOES:
//
// E1 — multi-aluno so nasce do que o HUMANO escreveu (legendaEfetiva), nunca do
//      OCR. E' a terceira vez que o OCR produz multi falso em dois dias (PIX do
//      Arthur 28/08, camisa PagBank 29/08): recibo carrega nome de pagador,
//      estabelecimento e conectivos "e" — nao e' lista de alunos. A guarda de
//      28/08 (rotulo unico na legenda) era estreita demais: legenda de lojinha
//      nem tem aluno rotulado. Sem legenda util, o fluxo single cuida — card sem
//      aluno pergunta o nome, que e' UX melhor que exigir divisao inexistente.
//
// E2 — SAIDA DA ARMADILHA: se a correcao do humano declara UM aluno so, o fluxo
//      multi converte para lancamento single com os dados declarados, em vez de
//      repetir "manda os dois".
//
// E3 — "camisa" entra no vocabulario de lojinha (so havia "camiseta").
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-camisa-multi-trap.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── E1: multi so da legenda ──────────────────────────────────────────────────
trocar(
  "      const _rotuloUnicoNaLegenda = !!_alunoRotulado(legendaEfetiva)\n" +
  "        && !detectarContextoMultiAluno(legendaEfetiva);\n" +
  "      if (detectarContextoMultiAluno(textoClassificacao) && !_rotuloUnicoNaLegenda) {",
  "      // Multi-aluno so nasce do que o HUMANO escreveu — NUNCA do OCR. Recibo\n" +
  "      // carrega pagador, estabelecimento e conectivos (\"e\"); ja produziu multi\n" +
  "      // falso 2x em 2 dias (PIX 28/08; camisa PagBank 29/08, com o interpretador\n" +
  "      // dizendo lojinha e R$65 de UMA camisa). Sem legenda util o single cuida:\n" +
  "      // card sem aluno pergunta o nome.\n" +
  "      if (detectarContextoMultiAluno(legendaEfetiva)) {",
  'E1 multi so nasce da legenda');

// ── E2: saida da armadilha quando o humano declara UM aluno ──────────────────
trocar(
  "          if (!intentMulti.ok) {\n            alvoManual.multiTexto = textoFonte; alvoManual.ts = agora;",
  "          // SAIDA DA ARMADILHA (Arthur/Barra 29/08): o humano disse que e' UM\n" +
  "          // aluno (\"venda de camisa para o aluno Theo de bem, 65 reais\") e o fluxo\n" +
  "          // multi repetia \"manda os dois\" para sempre. Um item declarado com nome\n" +
  "          // converte para lancamento single — o humano manda.\n" +
  "          const _um = (!intentMulti.ok && intentMulti.motivo === 'dois_itens_obrigatorios'\n" +
  "            && multiRaw && Array.isArray(multiRaw.itens) && multiRaw.itens.length === 1\n" +
  "            && multiRaw.itens[0] && multiRaw.itens[0].aluno_nome) ? multiRaw.itens[0] : null;\n" +
  "          if (_um) {\n" +
  "            const _valorU = Number(_um.valor || alvoManual.valor || 0) || null;\n" +
  "            const _formaU = extrairForma(txt, null) || alvoManual.forma || _um.forma || null;\n" +
  "            const _catU = String(_um.categoria || _categoriaFromCaption(txt) || alvoManual.categoria || 'outro').toLowerCase();\n" +
  "            let textoU = montarPreview({\n" +
  "              unidadeNome: grp.nome, valor: _valorU, forma: _formaU, categoria: _catU,\n" +
  "              aluno: _um.aluno_nome, competencia: _um.competencia || null, parcela: null,\n" +
  "              confiancaBaixa: false, responsavelFinanceiro: null, formaIncerta: !_formaU,\n" +
  "              cartaoModalidade: null, cartaoParcelas: null, multiplas: false,\n" +
  "              alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,\n" +
  "              canonica: null, duplicata: null, quitacao: null, faturaIndisponivel: false,\n" +
  "              composto: null, bloqueiaLancamento: false,\n" +
  "            });\n" +
  "            if (dryRun) textoU += '\\n\\n_(modo teste — nada será gravado no caixa)_';\n" +
  "            const previewIdU = await sendFn(chatId, 'Entendi — é um aluno só. Montei o lançamento:\\n\\n' + textoU);\n" +
  "            const pendU = {\n" +
  "              previewId: previewIdU, unidade_id: grp.unidade_id, nome: grp.nome,\n" +
  "              valor: _valorU, forma: _formaU, categoria: _catU, aluno: _um.aluno_nome,\n" +
  "              competencia: _um.competencia || null, descricao: null, parcela: null,\n" +
  "              responsavelFinanceiro: null, cartaoModalidade: null, cartaoParcelas: null,\n" +
  "              formaIncerta: !_formaU, quitacao: null, multiplas: false, composto: null,\n" +
  "              itemLojinha: null, bloqueiaLancamento: false, faturaIndisponivel: false,\n" +
  "              bloqueiaFonteIndisponivel: false, enviadoPor: null,\n" +
  "              idemKey: `${chatId}:${event.messageId}:um`, origem: alvoManual.origem || event.messageId,\n" +
  "              msgIds: [previewIdU], autorPhone: event.senderPhone || null, autorId: event.senderId || null,\n" +
  "              toquePor: String(event.senderPhone || event.senderId || ''), toqueTs: agora,\n" +
  "              arquivoBytes: alvoManual.arquivoBytes || null, ts: agora,\n" +
  "            };\n" +
  "            const v3u = await registrarPreviewPublicoV3({\n" +
  "              event, grupo: grp, previewId: previewIdU, texto: textoU, pendencia: pendU,\n" +
  "              result: { acao: 'multi_convertido_para_single', valor: _valorU, aluno: _um.aluno_nome },\n" +
  "            });\n" +
  "            if (v3u && v3u.preview_id) { pendU.v3PreviewId = v3u.preview_id; pendU.v3PreviewHash = v3u.preview_hash || null; }\n" +
  "            const arrN = limparVelhos(chatId, agora).filter((p) => p !== alvoManual);\n" +
  "            arrN.push(pendU);\n" +
  "            pendentes.set(chatId, arrN);\n" +
  "            log({ acao: 'multi_convertido_para_single', chatId, aluno: _um.aluno_nome, valor: _valorU });\n" +
  "            return { acao: 'multi_convertido_para_single', previewId: previewIdU };\n" +
  "          }\n" +
  "          if (!intentMulti.ok) {\n            alvoManual.multiTexto = textoFonte; alvoManual.ts = agora;",
  'E2 um aluno declarado converte para single');

// ── E3: camisa e' produto de lojinha ─────────────────────────────────────────
trocar(
  "const PRODUTO_LOJINHA_RE = /\\b(lojinha|loja|cordas?|palhetas?|baquetas?|capotraste|afinador(?:es)?|cabos?|correia|encordoamento|livro|apostila|camiseta)\\b/i;",
  "const PRODUTO_LOJINHA_RE = /\\b(lojinha|loja|cordas?|palhetas?|baquetas?|capotraste|afinador(?:es)?|cabos?|correia|encordoamento|livro|apostila|camisetas?|camisas?)\\b/i;",
  'E3 regex de produto aceita camisa');

trocar(
  "    const mItem = t.match(/\\b(palheta|baqueta|capotraste|afinador|cabo|correia|encordoamento|livro|apostila|camiseta)(?:\\s+de\\s+([a-zA-ZÀ-ÿ]+))?/i);",
  "    const mItem = t.match(/\\b(palheta|baqueta|capotraste|afinador|cabo|correia|encordoamento|livro|apostila|camiseta|camisa)(?:\\s+de\\s+([a-zA-ZÀ-ÿ]+))?/i);",
  'E3 extracao de item aceita camisa');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
