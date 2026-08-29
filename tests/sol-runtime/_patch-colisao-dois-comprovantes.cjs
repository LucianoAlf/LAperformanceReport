#!/usr/bin/env node
// Colisao de dois comprovantes (Fernanda + Daiana, Recreio, 29/08 08:20-08:53).
// A manha terminou com QUATRO pendencias abertas e ZERO lancamentos.
//
// O que o log mostrou, lance a lance:
//  1. A legenda da Fernanda ("...R$100,00") chegou 43ms ANTES do documento; o fluxo
//     gastou 45s em OCR+visao procurando valor, SO DEPOIS anexou a legenda-irma —
//     e o valor que estava escrito nela nunca foi lido ("valor nao identificado").
//  2. Fernanda citou a mensagem da Sol "Beleza, Fe: R$100 em pix. Posso lancar?
//     Responde pode" e disse "Pode" — a citacao nao casou (so o card conta como
//     previewId) e caiu na guarda de ambiguidade.
//  3. "Pode" seco com 2 cards abertos -> "responde pode no comprovante certo",
//     sempre — mesmo quando quem fala e a AUTORA de um dos comprovantes e a Sol
//     acabou de falar com ela sobre ele.
//  4. Cada reenvio do mesmo arquivo (citando o original) EMPILHOU um card novo em
//     vez de substituir o antigo — 4 pendencias do mesmo par de comprovantes.
//
// Correcoes:
//  F1 legenda-irma faz backfill de valor/forma ao ser anexada.
//  F2 pendencia guarda msgIds (toda mensagem da Sol sobre ela), autor e ultimo toque.
//  F3 citacao casa com QUALQUER mensagem da Sol ligada a pendencia (e com o
//     comprovante original).
//  F4 "pode" seco com 2+ cards resolve pelo AUTOR/ultimo toque de quem fala
//     (pedido explicito do Luciano: reconhecer pelo lid/telefone quem e quem);
//     quem nao tem card proprio recebe a lista numerada.
//  F5 reenvio do MESMO arquivo (file_bytes identico) substitui a pendencia antiga.
//  F6 depois de lancar, se sobrou card aberto, a Sol avisa o que ainda falta.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-colisao-dois-comprovantes.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error(`ANCORA "${rotulo}": esperava ${esperado}, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── F1: legenda-irma faz backfill de valor/forma ─────────────────────────────
trocar(
  "          textosRecentes.delete(_kTextoIrmao);\n          log({ acao: 'legenda_irma_anexada', chatId });",
  "          textosRecentes.delete(_kTextoIrmao);\n" +
  "          log({ acao: 'legenda_irma_anexada', chatId });\n" +
  "          // ⚠️ A irma pode chegar DEPOIS de o valor ja ter sido procurado (OCR ->\n" +
  "          // 45s de visao -> so entao anexa). Caso Livia 29/08: \"...R$100,00\" na\n" +
  "          // legenda e o card saiu \"valor nao identificado\". Backfill do que falta.\n" +
  "          if (!valor) { const _vIrma = extrairValor(legendaEfetiva); if (_vIrma) valor = _vIrma; }\n" +
  "          if (!forma) { const _fIrma = extrairForma(legendaEfetiva, null); if (_fIrma) forma = _fIrma; }",
  'F1 legenda-irma backfill valor/forma');

// ── F2: campos novos na pendencia principal + dedup por arquivo (F5) ─────────
trocar(
  "enviadoPor: nomeParaCarimbo(idEnviou, event), idemKey, origem: event.messageId, ts: agora };",
  "enviadoPor: nomeParaCarimbo(idEnviou, event), idemKey, origem: event.messageId,\n" +
  "        msgIds: [previewId], autorPhone: event.senderPhone || null, autorId: event.senderId || null,\n" +
  "        toquePor: String(event.senderPhone || event.senderId || ''), toqueTs: agora,\n" +
  "        arquivoBytes: (ocrMeta && ocrMeta.file_bytes) || null, ts: agora };\n" +
  "      // F5: reenviar o MESMO arquivo substitui a pendencia antiga (29/08: cada\n" +
  "      // reenvio citando o original empilhava um card novo — 4 pendencias, zero\n" +
  "      // lancamentos). file_bytes identico = mesmo comprovante.\n" +
  "      if (pendencia.arquivoBytes) {\n" +
  "        for (let _i = arr.length - 1; _i >= 0; _i--) {\n" +
  "          if (arr[_i].arquivoBytes === pendencia.arquivoBytes) {\n" +
  "            log({ acao: 'pendencia_substituida_reenvio', chatId, bytes: pendencia.arquivoBytes });\n" +
  "            arr.splice(_i, 1);\n" +
  "          }\n" +
  "        }\n" +
  "      }",
  'F2+F5 pendencia com autor/msgIds/arquivo e dedup de reenvio');

// ── F3: citacao casa com qualquer mensagem da Sol sobre a pendencia ──────────
trocar(
  "    const arrPend = limparVelhos(chatId, agora);\n    const respondeuPreview = !!(event.quotedMessageId && arrPend.some((p) => p.previewId === event.quotedMessageId));",
  "    const arrPend = limparVelhos(chatId, agora);\n" +
  "    // Citar QUALQUER mensagem da Sol sobre a pendencia vale — inclusive o proprio\n" +
  "    // \"Posso lancar? Responde pode\" (29/08: Fernanda citou exatamente essa mensagem\n" +
  "    // e caiu na guarda de ambiguidade). O comprovante original tambem vale.\n" +
  "    const _citaPend = (p, id) => p.previewId === id || p.origem === id || (Array.isArray(p.msgIds) && p.msgIds.includes(id));\n" +
  "    const respondeuPreview = !!(event.quotedMessageId && arrPend.some((p) => _citaPend(p, event.quotedMessageId)));",
  'F3 respondeuPreview casa msgIds/origem');

trocar(
  "      if (event.quotedMessageId) alvo = arr.find((p) => p.previewId === event.quotedMessageId) || null;",
  "      if (event.quotedMessageId) alvo = arr.find((p) => _citaPend(p, event.quotedMessageId)) || null;",
  'F3 alvo por citacao ampla');

trocar(
  "    return limparVelhos(chatId, agora).some((p) => p.previewId === quotedMessageId || p.origem === quotedMessageId);",
  "    return limparVelhos(chatId, agora).some((p) => p.previewId === quotedMessageId || p.origem === quotedMessageId || (Array.isArray(p.msgIds) && p.msgIds.includes(quotedMessageId)));",
  'F3 citaAlgumaPendencia inclui msgIds');

// ── F4: "pode" seco com 2+ cards resolve pelo autor / ultimo toque ───────────
trocar(
  "      if (!alvo) {\n        if (arr.length === 1) alvo = arr[0];\n        else { await sendFn(chatId, 'Tem mais de um comprovante aguardando — responde *pode* no comprovante certo, por favor.'); return { acao: 'ambiguo' }; }\n      }",
  "      if (!alvo) {\n" +
  "        if (arr.length === 1) alvo = arr[0];\n" +
  "        else {\n" +
  "          // \"pode\" seco com 2+ cards: resolve por QUEM fala (29/08: o card da\n" +
  "          // Fernanda e o da Daiana; o pode de cada uma e sobre o SEU — ou sobre o\n" +
  "          // ultimo que a Sol mostrou para ela). Toque mais recente ganha. Quem nao\n" +
  "          // tem card proprio recebe a lista numerada em vez de um enigma.\n" +
  "          const _quem = String(event.senderPhone || event.senderId || '');\n" +
  "          const _minhas = _quem ? arr.filter((p) =>\n" +
  "            String(p.toquePor || '') === _quem\n" +
  "            || String(p.autorPhone || '') === _quem\n" +
  "            || String(p.autorId || '') === _quem) : [];\n" +
  "          if (_minhas.length) {\n" +
  "            alvo = _minhas.reduce((a, b) => (((b.toqueTs || b.ts || 0) > (a.toqueTs || a.ts || 0)) ? b : a));\n" +
  "            log({ acao: 'pode_resolvido_por_autor', chatId, valor: alvo.valor || null });\n" +
  "          } else {\n" +
  "            const _lista = arr.map((p, i) => (i + 1) + ') ' + (p.aluno || p.descricao || cap(p.categoria || 'lançamento')) + (p.valor ? ' — ' + fmtBRL(p.valor) : '') + (p.enviadoPor ? ' (' + p.enviadoPor + ')' : '')).join('\\n');\n" +
  "            await sendFn(chatId, 'Tem mais de um comprovante aguardando:\\n' + _lista + '\\nResponde *pode* citando o card certo.');\n" +
  "            return { acao: 'ambiguo' };\n" +
  "          }\n" +
  "        }\n" +
  "      }",
  'F4 pode resolve por autor/toque');

// ── F2b: remontagens registram a mensagem nova e o toque ─────────────────────
trocar(
  "alvoP.previewId = await sendFn(chatId, texto);",
  "alvoP.previewId = await sendFn(chatId, texto);\n" +
  "            (alvoP.msgIds = alvoP.msgIds || []).push(alvoP.previewId);\n" +
  "            alvoP.toquePor = String(event.senderPhone || event.senderId || '') || alvoP.toquePor;\n" +
  "            alvoP.toqueTs = agora;",
  'F2b remontagens registram msgId+toque (7 sitios)', 7);

trocar(
  "alvoS.previewId = await sendFn(chatId, textoS);",
  "alvoS.previewId = await sendFn(chatId, textoS);\n" +
  "            (alvoS.msgIds = alvoS.msgIds || []).push(alvoS.previewId);\n" +
  "            alvoS.toquePor = String(event.senderPhone || event.senderId || '') || alvoS.toquePor;\n" +
  "            alvoS.toqueTs = agora;",
  'F2b remontagem de saida registra msgId+toque');

// ── F2c: o complemento (Anotei/Beleza) registra a mensagem e o toque ─────────
trocar(
  "          alvoP.ts = agora;\n          const falta = !alvoP.valor ? 'valor' : (!alvoP.forma ? 'forma' : null);",
  "          alvoP.ts = agora;\n" +
  "          alvoP.toquePor = String(event.senderPhone || event.senderId || '') || alvoP.toquePor;\n" +
  "          alvoP.toqueTs = agora;\n" +
  "          const falta = !alvoP.valor ? 'valor' : (!alvoP.forma ? 'forma' : null);",
  'F2c complemento atualiza toque');

trocar(
  "            await sendFn(chatId, `Anotei a forma (${alvoP.forma}). Só falta o valor: manda *pode, R$ X*.`);",
  "            { const _mid = await sendFn(chatId, `Anotei a forma (${alvoP.forma}). Só falta o valor: manda *pode, R$ X*.`); (alvoP.msgIds = alvoP.msgIds || []).push(_mid); }",
  'F2c registra msg Anotei-forma');

trocar(
  "            await sendFn(chatId, `Anotei ${fmtBRL(alvoP.valor)}. Só me diz a forma: *pode, pix* / *pode, dinheiro* / *pode, cartão*.`);",
  "            { const _mid = await sendFn(chatId, `Anotei ${fmtBRL(alvoP.valor)}. Só me diz a forma: *pode, pix* / *pode, dinheiro* / *pode, cartão*.`); (alvoP.msgIds = alvoP.msgIds || []).push(_mid); }",
  'F2c registra msg Anotei-valor');

trocar(
  "            await sendFn(chatId, `Beleza, ${quem}: *${fmtBRL(alvoP.valor)}* em ${formaTxt}. Posso lançar? Responde *pode*.`);",
  "            // ⚠️ E' exatamente ESTA mensagem que a Fernanda citou em 29/08 — ela tem\n" +
  "            // de contar como citacao valida da pendencia.\n" +
  "            { const _mid = await sendFn(chatId, `Beleza, ${quem}: *${fmtBRL(alvoP.valor)}* em ${formaTxt}. Posso lançar? Responde *pode*.`); (alvoP.msgIds = alvoP.msgIds || []).push(_mid); }",
  'F2c registra msg Beleza');

// ── F6: depois de lancar, avisa o que ainda esta aberto ──────────────────────
trocar(
  "        log({ acao: ehSaida ? 'saida_lancada' : 'lancado', movimentacao_id: r.movimentacao_id, valor: r.valor });\n        return { acao: ehSaida ? 'saida_lancada' : 'lancado', movimentacao_id: r.movimentacao_id };",
  "        // F6: \"antes de lancar veja se tem algum sem lancar\" — a Sol e' quem ve.\n" +
  "        const _aindaAbertas = limparVelhos(chatId, agora);\n" +
  "        if (_aindaAbertas.length) {\n" +
  "          await sendFn(chatId, '📌 Ainda aguardando: ' + _aindaAbertas.map((p) => (p.aluno || p.descricao || cap(p.categoria || 'lançamento')) + (p.valor ? ' — ' + fmtBRL(p.valor) : '')).join(' · ') + '. Responde *pode* citando o card.');\n" +
  "        }\n" +
  "        log({ acao: ehSaida ? 'saida_lancada' : 'lancado', movimentacao_id: r.movimentacao_id, valor: r.valor });\n" +
  "        return { acao: ehSaida ? 'saida_lancada' : 'lancado', movimentacao_id: r.movimentacao_id };",
  'F6 lembrete pos-lancamento');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
